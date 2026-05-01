// snag-cli — paste a link, get the file. terminal companion to the
// snag web frontend, talks to any snag-compatible api instance.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/spf13/cobra"

	"github.com/snag/snag-cli/internal/client"
	"github.com/snag/snag-cli/internal/config"
	"github.com/snag/snag-cli/internal/download"
	"github.com/snag/snag-cli/internal/version"
)

var (
	// runtime config resolved from env (flags override below)
	cfg = config.Resolve()

	// per-command flags, declared at package scope so root + subcommands
	// can share them in a single binary.
	flagInstance     string
	flagAPIKey       string
	flagOutput       string
	flagAudioOnly    bool
	flagMute         bool
	flagAudioFormat  string
	flagAudioBitrate string
	flagVideoQuality string
	flagVideoCodec   string
	flagContainer    string
	flagResize       string
	flagTrimStart    string
	flagTrimEnd      string
	flagQuiet        bool
)

func main() {
	if err := newRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(exitCodeFor(err))
	}
}

func newRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "snag <url>",
		Short: "paste a link, get the file",
		Long: `snag is a terminal media downloader. it talks to any snag-compatible api
instance and streams the result straight to disk.

  snag https://www.youtube.com/watch?v=dQw4w9WgXcQ
  snag <url> --audio
  snag <url> --trim 00:01:23 --trim-end 00:01:33 -o ./out/clip.mp4

with no flags, snag uses the api at http://localhost:9000 (override via
SNAG_INSTANCE or --instance).`,
		Args:    cobra.ExactArgs(1),
		Version: version.Version,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runDownload,
	}

	root.PersistentFlags().StringVar(&flagInstance, "instance", cfg.Instance, "snag api base URL (env: SNAG_INSTANCE)")
	root.PersistentFlags().StringVar(&flagAPIKey, "api-key", cfg.APIKey, "api key for authenticated instances (env: SNAG_API_KEY)")
	root.PersistentFlags().BoolVarP(&flagQuiet, "quiet", "q", false, "suppress progress bar")

	// download options are persistent so they apply to both `snag <url>`
	// and `snag batch <file>` without redeclaration. they're a no-op for
	// `snag info` etc.
	root.PersistentFlags().BoolVar(&flagAudioOnly, "audio", false, "audio-only download (alias for --mode audio)")
	root.PersistentFlags().BoolVar(&flagMute, "mute", false, "video-only, no audio (alias for --mode mute)")
	root.PersistentFlags().StringVar(&flagAudioFormat, "audio-format", "", "audio format: best|mp3|opus|ogg|wav")
	root.PersistentFlags().StringVar(&flagAudioBitrate, "audio-bitrate", "", "audio bitrate (kbps): 320|256|128|96|64|8")
	root.PersistentFlags().StringVar(&flagVideoQuality, "quality", "", "video quality: max|2160|1080|720|480|360|240|144")
	root.PersistentFlags().StringVar(&flagVideoCodec, "codec", "", "re-encode codec: h264|h265|av1|vp9 (forces re-encode)")
	root.PersistentFlags().StringVar(&flagContainer, "container", "", "output container: mp4|mkv|webm")
	root.PersistentFlags().StringVar(&flagResize, "resize", "", "resize to height: 2160|1440|1080|720|480|360 (forces re-encode)")
	root.PersistentFlags().StringVar(&flagTrimStart, "trim", "", "trim start (ss, mm:ss, or hh:mm:ss)")
	root.PersistentFlags().StringVar(&flagTrimEnd, "trim-end", "", "trim end (ss, mm:ss, or hh:mm:ss)")

	// -o is local to the single-URL command; batch uses --out-dir instead.
	root.Flags().StringVarP(&flagOutput, "output", "o", "", "output path (file or directory). defaults to a sensibly-named file in cwd.")

	root.AddCommand(newInfoCmd(), newBatchCmd())
	return root
}

// buildRequest converts the current download flags into a client.Request
// for the given url. shared by `snag <url>` and `snag batch`.
func buildRequest(url string) client.Request {
	req := client.Request{URL: url}

	switch {
	case flagAudioOnly:
		req.DownloadMode = "audio"
	case flagMute:
		req.DownloadMode = "mute"
	}
	if flagAudioFormat != "" {
		req.AudioFormat = flagAudioFormat
	}
	if flagAudioBitrate != "" {
		req.AudioBitrate = flagAudioBitrate
	}
	if flagVideoQuality != "" {
		req.VideoQuality = flagVideoQuality
	}
	if flagVideoCodec != "" {
		req.VideoCodec = flagVideoCodec
	}
	if flagContainer != "" {
		req.VideoContainer = flagContainer
	}
	if flagResize != "" {
		req.TargetHeight = flagResize
	}
	if flagTrimStart != "" {
		req.TrimStart = flagTrimStart
	}
	if flagTrimEnd != "" {
		req.TrimEnd = flagTrimEnd
	}
	return req
}

func newInfoCmd() *cobra.Command {
	return &cobra.Command{
		Use:           "info",
		Short:         "show snag api instance info",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			c := client.New(flagInstance)
			c.APIKey = flagAPIKey
			info, err := c.Info()
			if err != nil {
				return fmt.Errorf("could not reach %s: %w", flagInstance, err)
			}
			root := info.Snag.Version
			services := info.Snag.Services
			if root == "" {
				root = info.Cobalt.Version
				services = info.Cobalt.Services
			}
			fmt.Printf("instance: %s\n", flagInstance)
			fmt.Printf("version:  %s\n", root)
			fmt.Printf("commit:   %s\n", shortSha(info.Git.Commit))
			fmt.Printf("branch:   %s\n", info.Git.Branch)
			fmt.Printf("services: %d\n", len(services))
			for _, s := range services {
				fmt.Printf("  - %s\n", s)
			}
			return nil
		},
	}
}

func runDownload(cmd *cobra.Command, args []string) error {
	url := strings.TrimSpace(args[0])
	if url == "" {
		return errors.New("url is required")
	}

	c := client.New(flagInstance)
	c.APIKey = flagAPIKey

	req := buildRequest(url)

	resp, err := c.Submit(req)
	if err != nil {
		return fmt.Errorf("submit: %w", err)
	}
	if resp.Status == "error" && resp.Error != nil {
		return apiErr{code: resp.Error.Code}
	}

	final, err := download.Save(c, resp, flagOutput, flagQuiet)
	if err != nil {
		return err
	}
	fmt.Println(final)
	return nil
}

// ----- batch -----

func newBatchCmd() *cobra.Command {
	var batchOutDir string
	var batchConcurrency int
	var batchContinueOnError bool

	cmd := &cobra.Command{
		Use:   "batch <file>",
		Short: "download many urls in parallel",
		Long: `read URLs (one per line) from <file> and download them in parallel.
use "-" to read from stdin. lines starting with # and blank lines are skipped.

  snag batch urls.txt
  cat urls.txt | snag batch -
  snag batch urls.txt --concurrency 8 --out-dir ./downloads --audio
  snag batch urls.txt --quality 720 --codec h265

shared options (--audio, --quality, --codec, --resize, --trim, etc.) apply
to every URL in the batch. each result lands in --out-dir under the
filename suggested by the API.`,
		Args:          cobra.ExactArgs(1),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runBatch(args[0], batchOutDir, batchConcurrency, batchContinueOnError)
		},
	}

	cmd.Flags().StringVar(&batchOutDir, "out-dir", ".", "output directory for batch downloads")
	cmd.Flags().IntVar(&batchConcurrency, "concurrency", 4, "number of parallel downloads (1-16)")
	cmd.Flags().BoolVar(&batchContinueOnError, "continue-on-error", true, "keep going when individual urls fail")
	return cmd
}

// readURLs returns the non-blank, non-comment lines from a file or "-" for stdin.
func readURLs(path string) ([]string, error) {
	var r io.Reader
	if path == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(path)
		if err != nil {
			return nil, fmt.Errorf("open %s: %w", path, err)
		}
		defer f.Close()
		r = f
	}

	urls := make([]string, 0, 16)
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow long lines
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		urls = append(urls, line)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return urls, nil
}

// batchResult captures the outcome of a single URL in a batch run.
type batchResult struct {
	idx      int
	url      string
	final    string
	errCode  string
	errMsg   string
	duration time.Duration
}

func runBatch(srcPath, outDir string, concurrency int, continueOnError bool) error {
	if concurrency < 1 {
		concurrency = 1
	}
	if concurrency > 16 {
		concurrency = 16
	}

	urls, err := readURLs(srcPath)
	if err != nil {
		return err
	}
	if len(urls) == 0 {
		return errors.New("no urls in input")
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", outDir, err)
	}

	if !flagQuiet {
		fmt.Fprintf(os.Stderr, "snag batch: %d url(s), concurrency %d, out-dir %s\n",
			len(urls), concurrency, outDir)
	}

	c := client.New(flagInstance)
	c.APIKey = flagAPIKey

	results := make([]batchResult, len(urls))
	var done atomic.Int64

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	logLock := sync.Mutex{}
	logLine := func(format string, args ...any) {
		logLock.Lock()
		defer logLock.Unlock()
		fmt.Fprintf(os.Stderr, format+"\n", args...)
	}

	start := time.Now()
	for i, u := range urls {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, url string) {
			defer wg.Done()
			defer func() { <-sem }()

			t0 := time.Now()
			res := batchResult{idx: idx, url: url}
			defer func() {
				res.duration = time.Since(t0)
				results[idx] = res
				n := done.Add(1)
				if !flagQuiet {
					if res.errCode != "" || res.errMsg != "" {
						msg := res.errCode
						if msg == "" {
							msg = res.errMsg
						}
						logLine("[%d/%d] %s ✗ %s", n, len(urls), short(url, 60), msg)
					} else {
						logLine("[%d/%d] %s → %s", n, len(urls), short(url, 60), res.final)
					}
				}
			}()

			req := buildRequest(url)
			resp, err := c.Submit(req)
			if err != nil {
				res.errMsg = "transport: " + err.Error()
				return
			}
			if resp.Status == "error" {
				if resp.Error != nil {
					res.errCode = resp.Error.Code
				} else {
					res.errCode = "error.api.unknown"
				}
				return
			}

			final, err := download.Save(c, resp, outDir, true /* always quiet per-url for batch */)
			if err != nil {
				res.errMsg = err.Error()
				return
			}
			res.final = final
		}(i, u)
	}
	wg.Wait()

	// summary
	var ok, fail int
	for _, r := range results {
		if r.errCode != "" || r.errMsg != "" {
			fail++
		} else {
			ok++
		}
	}

	if !flagQuiet {
		fmt.Fprintf(os.Stderr, "\ndone in %s — %d ok, %d failed\n",
			time.Since(start).Round(time.Millisecond), ok, fail)
	}

	if fail > 0 && !continueOnError {
		return apiErr{code: "error.batch.partial"}
	}
	if fail > 0 {
		// continueOnError true: still surface a non-zero exit so scripts
		// can detect partial failure. use exit code 1 (generic).
		return errors.New("batch finished with failures")
	}
	return nil
}

func short(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

// ----- error/exit handling -----

type apiErr struct{ code string }

func (e apiErr) Error() string { return "api: " + e.code }

func exitCodeFor(err error) int {
	if err == nil {
		return 0
	}
	var ae apiErr
	if errors.As(err, &ae) {
		switch {
		case strings.HasPrefix(ae.code, "error.api.link"):
			return 3
		case strings.HasPrefix(ae.code, "error.api.auth"):
			return 4
		}
		return 1
	}
	return 1
}

func shortSha(s string) string {
	if len(s) > 8 {
		return s[:8]
	}
	return s
}
