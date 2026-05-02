// Package client is a thin HTTP client for the Snag API. It mirrors
// the request/response shapes used by api/src/processing/schema.js
// and stays intentionally minimal — features like queueing and
// retry policy live in the caller.
package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Request is the body sent to POST /. Only Url is required; every
// other field maps 1:1 to a Snag API option and is omitted from
// the JSON payload when zero.
type Request struct {
	URL                   string `json:"url"`
	AudioBitrate          string `json:"audioBitrate,omitempty"`
	AudioFormat           string `json:"audioFormat,omitempty"`
	DownloadMode          string `json:"downloadMode,omitempty"`
	FilenameStyle         string `json:"filenameStyle,omitempty"`
	YoutubeVideoCodec     string `json:"youtubeVideoCodec,omitempty"`
	YoutubeVideoContainer string `json:"youtubeVideoContainer,omitempty"`
	VideoQuality          string `json:"videoQuality,omitempty"`
	LocalProcessing       string `json:"localProcessing,omitempty"`
	YoutubeDubLang        string `json:"youtubeDubLang,omitempty"`
	SubtitleLang          string `json:"subtitleLang,omitempty"`
	DisableMetadata       bool   `json:"disableMetadata,omitempty"`
	AllowH265             bool   `json:"allowH265,omitempty"`
	ConvertGif            *bool  `json:"convertGif,omitempty"`
	AlwaysProxy           bool   `json:"alwaysProxy,omitempty"`
	YoutubeHLS            bool   `json:"youtubeHLS,omitempty"`
	YoutubeBetterAudio    bool   `json:"youtubeBetterAudio,omitempty"`

	// F3 trim
	TrimStart string `json:"trimStart,omitempty"`
	TrimEnd   string `json:"trimEnd,omitempty"`

	// F2 conversion
	VideoCodec     string `json:"videoCodec,omitempty"`
	VideoContainer string `json:"videoContainer,omitempty"`
	TargetHeight   string `json:"targetHeight,omitempty"`
	BurnSubtitles  bool   `json:"burnSubtitles,omitempty"`
}

// PickerItem is one row in a multi-item response.
type PickerItem struct {
	Type  string `json:"type"`
	URL   string `json:"url"`
	Thumb string `json:"thumb,omitempty"`
}

// Response decodes any of the standard response shapes returned by
// POST /. Fields are mutually exclusive based on Status.
type Response struct {
	Status        string       `json:"status"`
	URL           string       `json:"url,omitempty"`
	Filename      string       `json:"filename,omitempty"`
	Audio         string       `json:"audio,omitempty"`
	AudioFilename string       `json:"audioFilename,omitempty"`
	Picker        []PickerItem `json:"picker,omitempty"`
	Tunnel        []string     `json:"tunnel,omitempty"`
	Error         *struct {
		Code    string                 `json:"code"`
		Context map[string]interface{} `json:"context,omitempty"`
	} `json:"error,omitempty"`
}

// InstanceInfo is the GET / payload.
type InstanceInfo struct {
	Snag struct {
		Version  string   `json:"version"`
		Services []string `json:"services"`
	} `json:"snag"`
	Cobalt struct {
		Version  string   `json:"version"`
		Services []string `json:"services"`
	} `json:"cobalt"`
	Git struct {
		Commit string `json:"commit"`
		Branch string `json:"branch"`
	} `json:"git"`
}

// Client wraps an http.Client and the base URL of a Snag instance.
type Client struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
	UserAgent  string
}

// New builds a Client with sensible defaults. baseURL must point at the
// root of a Snag API (e.g. http://localhost:9000).
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		UserAgent: "snag-cli/0.1.0",
	}
}

func (c *Client) headers(req *http.Request) {
	req.Header.Set("accept", "application/json")
	req.Header.Set("user-agent", c.UserAgent)
	if c.APIKey != "" {
		req.Header.Set("authorization", "Api-Key "+c.APIKey)
	}
}

// Submit POSTs the request to /. Returns the decoded response. A
// transport error (network, JSON parse) is returned as an error;
// API-level error responses come back inside Response.
func (c *Client) Submit(r Request) (*Response, error) {
	body, err := json.Marshal(r)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	req, err := http.NewRequest("POST", c.BaseURL+"/", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	c.headers(req)
	req.Header.Set("content-type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("post /: %w", err)
	}
	defer resp.Body.Close()

	var out Response
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &out, nil
}

// Info pulls GET / for instance metadata.
func (c *Client) Info() (*InstanceInfo, error) {
	req, err := http.NewRequest("GET", c.BaseURL+"/", nil)
	if err != nil {
		return nil, err
	}
	c.headers(req)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("instance returned %d", resp.StatusCode)
	}
	var out InstanceInfo
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// FetchError reports a non-2xx HTTP status from a download URL. Useful
// for distinguishing recoverable conditions like tunnel expiry (403/410
// from the snag api) from generic network failures.
type FetchError struct {
	StatusCode int
	URL        string
}

func (e *FetchError) Error() string {
	return fmt.Sprintf("download %s returned %d", e.URL, e.StatusCode)
}

// IsTunnelExpired reports whether the status looks like a tunnel TTL
// rejection from snag-api: 403 (signature ok but exp passed in older
// builds) or 410 Gone. The caller should re-POST the original request
// to mint a fresh tunnel URL and retry from the bytes already on disk.
func (e *FetchError) IsTunnelExpired() bool {
	return e.StatusCode == 403 || e.StatusCode == 404 || e.StatusCode == 410
}

// Download is a streaming response. The Reader yields the bytes the
// caller needs to write; for resumed downloads (IsPartial true) the
// reader yields only the bytes after StartedAt.
type Download struct {
	HTTPStatus int
	Filename   string
	// TotalSize is the full content length when known (in bytes).
	// For resumed downloads, it includes the bytes already on disk.
	TotalSize int64
	// StartedAt is the offset (in bytes) the response begins at on the
	// source timeline. Always 0 for full responses; >=0 for 206.
	StartedAt int64
	// IsPartial is true when the server honoured the Range header
	// (HTTP 206). False on 200, even if a Range was requested — the
	// caller must truncate any existing .part in that case.
	IsPartial bool
	Reader    io.ReadCloser
}

// Fetch performs GET on a download URL (tunnel or external) and
// returns a streaming Download. Closing Download.Reader is the
// caller's responsibility.
//
// startAt > 0 sends a Range header so the server can serve a partial
// response. Resumability requires the server to support byte-range
// requests; on 200 (no Range support), Download.IsPartial is false
// and the caller must restart from 0.
func (c *Client) Fetch(downloadURL string, startAt int64) (*Download, error) {
	if _, err := url.Parse(downloadURL); err != nil {
		return nil, fmt.Errorf("invalid download URL: %w", err)
	}
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("user-agent", c.UserAgent)
	if startAt > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", startAt))
	}
	// streaming tunnels can outlive the default 60s timeout
	httpClient := &http.Client{Transport: c.HTTPClient.Transport}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		resp.Body.Close()
		// typed error so callers can distinguish "tunnel expired" (403/410)
		// from real transport errors and re-issue the original POST to
		// mint a fresh tunnel URL.
		return nil, &FetchError{StatusCode: resp.StatusCode, URL: downloadURL}
	}

	d := &Download{
		HTTPStatus: resp.StatusCode,
		Reader:     resp.Body,
		IsPartial:  resp.StatusCode == http.StatusPartialContent,
	}

	// Content-Length is the bytes in the body; for 206 it's the bytes
	// remaining, not the full file size.
	var clen int64
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		fmt.Sscanf(cl, "%d", &clen)
	}

	if d.IsPartial {
		if cr := resp.Header.Get("Content-Range"); cr != "" {
			// "bytes 1024-2047/2048" or "bytes 1024-2047/*"
			var start, end, total int64
			n, _ := fmt.Sscanf(cr, "bytes %d-%d/%d", &start, &end, &total)
			if n >= 2 {
				d.StartedAt = start
				if n == 3 {
					d.TotalSize = total
				}
			}
		}
	}

	if d.TotalSize == 0 {
		d.TotalSize = d.StartedAt + clen
	}
	if d.TotalSize == 0 {
		// snag tunnels expose an estimated full size for pipelines
		// where the real Content-Length isn't known up front.
		if est := resp.Header.Get("Estimated-Content-Length"); est != "" {
			var est64 int64
			fmt.Sscanf(est, "%d", &est64)
			d.TotalSize = est64
		}
	}

	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		d.Filename = parseFilename(cd)
	}
	return d, nil
}

// parseFilename pulls the filename="..." token out of a
// Content-Disposition header. Best-effort, no full RFC compliance.
func parseFilename(cd string) string {
	const tag = "filename="
	idx := strings.Index(cd, tag)
	if idx < 0 {
		return ""
	}
	rest := cd[idx+len(tag):]
	rest = strings.TrimSpace(rest)
	rest = strings.Trim(rest, `"`)
	if i := strings.Index(rest, ";"); i >= 0 {
		rest = rest[:i]
	}
	return strings.TrimSpace(rest)
}

// ErrInstanceUnreachable signals the configured Snag instance can't
// be contacted at all (DNS, refused, etc.).
var ErrInstanceUnreachable = errors.New("instance unreachable")
