// Package download writes a snag-api response to disk, picking a
// filename and showing a progress bar.
package download

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/schollz/progressbar/v3"

	"github.com/snag/snag-cli/internal/client"
)

// Save streams a response payload to disk. If outputPath is empty,
// the filename from the API response (or HTTP Content-Disposition)
// is used, falling back to "snag-download" when neither is present.
// Returns the final on-disk path written.
func Save(c *client.Client, resp *client.Response, outputPath string, quiet bool) (string, error) {
	if resp == nil {
		return "", errors.New("nil response")
	}

	switch resp.Status {
	case "redirect", "tunnel":
		return saveSingle(c, resp.URL, resp.Filename, outputPath, quiet)
	case "picker":
		return "", fmt.Errorf("picker responses (%d items) require --pick or interactive mode (not yet supported by the cli)", len(resp.Picker))
	case "local-processing":
		return "", fmt.Errorf("local-processing responses are handled by the web frontend; set localProcessing=disabled in /settings or via --local-processing=disabled to have the server merge instead")
	case "error":
		if resp.Error != nil {
			return "", fmt.Errorf("api error: %s", resp.Error.Code)
		}
		return "", errors.New("api error: unknown")
	case "batch":
		return "", errors.New("batch responses are handled by the batch command, not save")
	default:
		return "", fmt.Errorf("unsupported response status %q", resp.Status)
	}
}

func saveSingle(c *client.Client, url, filename, outputPath string, quiet bool) (string, error) {
	if url == "" {
		return "", errors.New("response missing url")
	}

	// resolve final path first so we can check for an existing .part to
	// resume from before issuing the GET.
	finalPath, err := resolveOutputPath(outputPath, filename, "")
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		return "", err
	}
	tmp := finalPath + ".part"

	var startAt int64
	if info, err := os.Stat(tmp); err == nil && info.Size() > 0 {
		startAt = info.Size()
	}

	dl, err := c.Fetch(url, startAt)
	if err != nil {
		return "", err
	}
	defer dl.Reader.Close()

	// if the API negotiated a different filename, refresh finalPath / tmp
	// only when the caller didn't pin a specific output file. avoids the
	// rare case where Content-Disposition yields a name we hadn't seen.
	if dl.Filename != "" && filename == "" && outputPath == "" {
		alt, err := resolveOutputPath(outputPath, dl.Filename, dl.Filename)
		if err == nil {
			finalPath = alt
			tmp = finalPath + ".part"
		}
	}

	// If we asked for a Range but the server gave us 200 (full content)
	// — or if the existing .part offset doesn't match the negotiated
	// StartedAt — restart from zero.
	resuming := dl.IsPartial && startAt > 0 && dl.StartedAt == startAt
	flag := os.O_CREATE | os.O_WRONLY
	if resuming {
		flag |= os.O_APPEND
	} else {
		flag |= os.O_TRUNC
	}
	f, err := os.OpenFile(tmp, flag, 0o644)
	if err != nil {
		return "", fmt.Errorf("open %s: %w", tmp, err)
	}
	defer func() {
		_ = f.Close()
	}()

	var dst io.Writer = f
	var bar *progressbar.ProgressBar
	if !quiet {
		desc := filepath.Base(finalPath)
		if resuming {
			desc = "↻ " + desc
		}
		if dl.TotalSize > 0 {
			bar = progressbar.NewOptions64(
				dl.TotalSize,
				progressbar.OptionSetDescription(desc),
				progressbar.OptionShowBytes(true),
				progressbar.OptionSetWidth(30),
				progressbar.OptionThrottle(100*1e6),
				progressbar.OptionClearOnFinish(),
			)
			if resuming {
				_ = bar.Add64(dl.StartedAt)
			}
		} else {
			bar = progressbar.NewOptions(-1,
				progressbar.OptionSetDescription(desc),
				progressbar.OptionSpinnerType(14),
				progressbar.OptionShowBytes(true),
				progressbar.OptionClearOnFinish(),
			)
		}
		dst = io.MultiWriter(f, bar)
	}

	if _, err := io.Copy(dst, dl.Reader); err != nil {
		// keep the .part on i/o errors so the next run can resume
		return "", fmt.Errorf("write %s: %w", tmp, err)
	}
	if bar != nil {
		_ = bar.Finish()
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, finalPath); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return finalPath, nil
}

// resolveOutputPath chooses the final on-disk path:
//   - if outputPath ends in a separator or is an existing dir, treat
//     it as a directory and use one of the candidate filenames inside it.
//   - if outputPath has no extension and points at a non-existing file,
//     also treat it as a target dir for safety.
//   - otherwise outputPath is the literal file path the user asked for.
//   - if outputPath is empty, write to the current working directory
//     using the first non-empty candidate.
func resolveOutputPath(outputPath, apiFilename, httpFilename string) (string, error) {
	candidates := []string{apiFilename, httpFilename, "snag-download"}
	pick := func() string {
		for _, c := range candidates {
			c = strings.TrimSpace(c)
			if c != "" {
				return c
			}
		}
		return "snag-download"
	}

	if outputPath == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return "", err
		}
		return filepath.Join(cwd, sanitiseFilename(pick())), nil
	}

	// directory if it ends in separator
	if strings.HasSuffix(outputPath, string(os.PathSeparator)) {
		return filepath.Join(outputPath, sanitiseFilename(pick())), nil
	}

	// directory if it exists as a directory
	if info, err := os.Stat(outputPath); err == nil && info.IsDir() {
		return filepath.Join(outputPath, sanitiseFilename(pick())), nil
	}

	// otherwise treat as literal file path
	return outputPath, nil
}

// sanitiseFilename strips path separators, NUL/control chars, and the
// Windows-reserved colon so a server-suggested filename can't escape the
// chosen directory or land on a reserved name.
func sanitiseFilename(name string) string {
	// drop NUL + low-control bytes (\x00..\x1f) so an attacker can't
	// truncate the filename via NUL on POSIX or land on a reserved
	// name on Windows.
	name = strings.Map(func(r rune) rune {
		if r < 0x20 {
			return -1
		}
		return r
	}, name)
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	// : is reserved on windows + macOS HFS+; strip to avoid surprises.
	name = strings.ReplaceAll(name, ":", "_")
	name = strings.TrimSpace(name)
	if name == "" {
		return "snag-download"
	}
	return name
}
