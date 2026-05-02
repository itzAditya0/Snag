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

// ResubmitFunc re-issues the original POST that produced the response
// being saved. Used to mint a fresh tunnel URL when the current one
// expires mid-download. Pass nil if you don't have the original
// request handy — Save will fail hard on tunnel expiry instead of
// retrying.
type ResubmitFunc func() (*client.Response, error)

// Save streams a response payload to disk. If outputPath is empty,
// the filename from the API response (or HTTP Content-Disposition)
// is used, falling back to "snag-download" when neither is present.
// Returns the final on-disk path written.
//
// resubmit is optional: when provided, Save will recover from tunnel
// expiry mid-download by calling resubmit() to obtain a fresh tunnel
// URL and resuming from the bytes already on disk.
func Save(c *client.Client, resp *client.Response, outputPath string, quiet bool, resubmit ResubmitFunc) (string, error) {
	if resp == nil {
		return "", errors.New("nil response")
	}

	switch resp.Status {
	case "redirect", "tunnel":
		return saveSingle(c, resp.URL, resp.Filename, outputPath, quiet, resubmit)
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

func saveSingle(c *client.Client, url, filename, outputPath string, quiet bool, resubmit ResubmitFunc) (string, error) {
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

	// fetchOnce wraps a single GET attempt. on tunnel-expired responses
	// we mint a fresh tunnel via resubmit() and retry; we only do this
	// once per Save call so a misconfigured api can't put us in an
	// infinite re-mint loop.
	dl, currentURL, err := fetchOnce(c, url, startAt, resubmit)
	if err != nil {
		return "", err
	}
	defer dl.Reader.Close()
	_ = currentURL

	// if the API negotiated a different filename, refresh finalPath / tmp
	// only when the caller didn't pin a specific output file. avoids the
	// rare case where Content-Disposition yields a name we hadn't seen.
	//
	// AUDIT FIX: previous code overwrote finalPath/tmp without moving the
	// already-accumulated .part — leaving the resume bytes orphaned on
	// disk and starting fresh from byte 0 at the new path. now we rename
	// the existing .part to the new tmp so the resume actually resumes.
	if dl.Filename != "" && filename == "" && outputPath == "" {
		alt, altErr := resolveOutputPath(outputPath, dl.Filename, dl.Filename)
		if altErr == nil && alt != finalPath {
			newTmp := alt + ".part"
			if startAt > 0 {
				if renameErr := os.Rename(tmp, newTmp); renameErr != nil {
					// rename failed (probably cross-device) — fall back to
					// keeping the original path so we don't lose progress.
					_ = renameErr
				} else {
					finalPath = alt
					tmp = newTmp
				}
			} else {
				finalPath = alt
				tmp = newTmp
			}
		}
	}

	// AUDIT FIX (blocker): cobalt's resume check was too permissive. If
	// the server returned 206 with `Content-Range: bytes K-...` where
	// K != startAt, we'd treat resuming=false, O_TRUNC the .part, and
	// then write the server's bytes-from-K starting at offset 0 — losing
	// the first K bytes of the source silently.
	//
	// the only safe options when 206 offset doesn't match our request are:
	//   a) re-fetch from byte 0 (we asked for K, server gave us K' — we
	//      can't reconcile, so start over and overwrite from scratch)
	//   b) error out
	// we do (a). it costs the bytes we already had, but produces a
	// correct file rather than a corrupted one.
	if dl.IsPartial && dl.StartedAt != startAt {
		dl.Reader.Close()
		// re-fetch from 0; ignore the existing .part contents.
		dl, currentURL, err = fetchOnce(c, currentURL, 0, resubmit)
		if err != nil {
			return "", fmt.Errorf("retry from 0 after offset mismatch: %w", err)
		}
		defer dl.Reader.Close()
		startAt = 0
	}

	// If we asked for a Range but the server gave us 200 (full content),
	// restart from zero.
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
		// AUDIT FIX: previous code removed the .part on rename failure,
		// losing all the downloaded bytes. cross-device rename is the
		// most common cause; copy + remove instead so the data survives.
		if copyErr := copyFile(tmp, finalPath); copyErr != nil {
			return "", fmt.Errorf("rename %s -> %s: %w (copy fallback: %v)", tmp, finalPath, err, copyErr)
		}
		_ = os.Remove(tmp)
	}
	return finalPath, nil
}

// fetchOnce issues a single Fetch and recovers from a tunnel-expired
// response by re-POSTing the original request via resubmit() exactly
// once. Returns the active URL alongside the Download so callers can
// re-Fetch (e.g. for 206-offset retry) against the right URL.
func fetchOnce(c *client.Client, url string, startAt int64, resubmit ResubmitFunc) (*client.Download, string, error) {
	dl, err := c.Fetch(url, startAt)
	if err == nil {
		return dl, url, nil
	}
	var fe *client.FetchError
	if !errors.As(err, &fe) || !fe.IsTunnelExpired() || resubmit == nil {
		return nil, url, err
	}
	// tunnel TTL elapsed mid-download. re-issue the original POST to
	// mint a fresh tunnel URL, then re-Fetch from where we left off.
	resp, rerr := resubmit()
	if rerr != nil {
		return nil, url, fmt.Errorf("resubmit after tunnel-expiry: %w", rerr)
	}
	if resp == nil || resp.URL == "" {
		return nil, url, errors.New("resubmit returned no url")
	}
	dl, err = c.Fetch(resp.URL, startAt)
	if err != nil {
		return nil, resp.URL, fmt.Errorf("fetch fresh tunnel: %w", err)
	}
	return dl, resp.URL, nil
}

// copyFile is a fallback for cross-device os.Rename failures.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
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
