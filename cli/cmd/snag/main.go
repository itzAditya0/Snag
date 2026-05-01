// snag-cli — paste a link, get the file. terminal companion to the
// snag web frontend, talks to any snag-compatible api instance.
package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

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

	root.Flags().StringVarP(&flagOutput, "output", "o", "", "output path (file or directory). defaults to a sensibly-named file in cwd.")
	root.Flags().BoolVar(&flagAudioOnly, "audio", false, "audio-only download (alias for --mode audio)")
	root.Flags().BoolVar(&flagMute, "mute", false, "video-only, no audio (alias for --mode mute)")
	root.Flags().StringVar(&flagAudioFormat, "audio-format", "", "audio format: best|mp3|opus|ogg|wav")
	root.Flags().StringVar(&flagAudioBitrate, "audio-bitrate", "", "audio bitrate (kbps): 320|256|128|96|64|8")
	root.Flags().StringVar(&flagVideoQuality, "quality", "", "video quality: max|2160|1080|720|480|360|240|144")
	root.Flags().StringVar(&flagVideoCodec, "codec", "", "re-encode codec: h264|h265|av1|vp9 (forces re-encode)")
	root.Flags().StringVar(&flagContainer, "container", "", "output container: mp4|mkv|webm")
	root.Flags().StringVar(&flagResize, "resize", "", "resize to height: 2160|1440|1080|720|480|360 (forces re-encode)")
	root.Flags().StringVar(&flagTrimStart, "trim", "", "trim start (ss, mm:ss, or hh:mm:ss)")
	root.Flags().StringVar(&flagTrimEnd, "trim-end", "", "trim end (ss, mm:ss, or hh:mm:ss)")

	root.AddCommand(newInfoCmd())
	return root
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
