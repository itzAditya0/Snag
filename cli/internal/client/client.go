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

// Download fetches a file URL (typically a tunnel link) into w. It
// surfaces the negotiated filename via Content-Disposition when the
// caller doesn't already have one.
type Download struct {
	HTTPStatus int
	Filename   string
	Size       int64
	Reader     io.ReadCloser
}

// Fetch performs GET on a download URL (tunnel or external) and
// returns a streaming Download. Closing Download.Reader is the
// caller's responsibility.
func (c *Client) Fetch(downloadURL string) (*Download, error) {
	if _, err := url.Parse(downloadURL); err != nil {
		return nil, fmt.Errorf("invalid download URL: %w", err)
	}
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("user-agent", c.UserAgent)
	// allow streaming a long-running tunnel without the 60s default
	httpClient := &http.Client{
		Transport: c.HTTPClient.Transport,
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		resp.Body.Close()
		return nil, fmt.Errorf("download returned %d", resp.StatusCode)
	}
	d := &Download{
		HTTPStatus: resp.StatusCode,
		Reader:     resp.Body,
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		// best-effort; ignore errors
		fmt.Sscanf(cl, "%d", &d.Size)
	}
	if est := resp.Header.Get("Estimated-Content-Length"); est != "" && d.Size == 0 {
		fmt.Sscanf(est, "%d", &d.Size)
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
