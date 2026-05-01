// Package instance handles snag instance discovery, scoring, and the
// per-user pinning config at ~/.config/snag/config.json.
package instance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

// DefaultSource is intentionally empty. snag does not ship a hard-coded
// default discovery URL — the user must opt in to a source via
// `snag instances source add <url>`. this avoids accidentally trusting
// a third-party (e.g. cobalt's) instance directory on first run, and
// keeps `snag instances refresh` a no-op until the operator has chosen
// where to fetch from.
const DefaultSource = ""

// Instance is one row in the discovery output. fields beyond URL come
// from a source list when available, or from a live `GET /` ping.
type Instance struct {
	URL      string   `json:"url"`
	Version  string   `json:"version,omitempty"`
	Services []string `json:"services,omitempty"`
}

// CheckResult is the outcome of a live `GET /` against an instance.
type CheckResult struct {
	URL         string
	Reachable   bool
	Latency     time.Duration
	Version     string
	NumServices int
	Branch      string
	Commit      string
	ErrorMsg    string
}

// Config is the user-level snag-cli config persisted as JSON.
type Config struct {
	// Pinned is the URL `snag <url>` defaults to when --instance and
	// SNAG_INSTANCE are not set.
	Pinned string `json:"pinned,omitempty"`
	// Sources is the list of remote URLs to fetch instance lists from.
	// when empty, `instances refresh` is a no-op.
	Sources []string `json:"sources,omitempty"`
}

// configFile resolves the on-disk config path, honouring XDG_CONFIG_HOME
// on Unix and APPDATA on Windows. returns an absolute path.
func configFile() (string, error) {
	if runtime.GOOS == "windows" {
		if app := os.Getenv("APPDATA"); app != "" {
			return filepath.Join(app, "snag", "config.json"), nil
		}
	}
	if v := os.Getenv("XDG_CONFIG_HOME"); v != "" {
		return filepath.Join(v, "snag", "config.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "snag", "config.json"), nil
}

// LoadConfig reads the per-user config; returns a zero-value Config when
// the file doesn't exist yet (not an error).
func LoadConfig() (Config, error) {
	path, err := configFile()
	if err != nil {
		return Config{}, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, nil
		}
		return Config{}, fmt.Errorf("read %s: %w", path, err)
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return Config{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return c, nil
}

// SaveConfig writes the per-user config atomically, creating any missing
// directories. returns the path written for caller logging.
func SaveConfig(c Config) (string, error) {
	path, err := configFile()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(tmp, append(b, '\n'), 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return path, nil
}

// FetchList pulls an instance list from a single source URL. Accepts
// both `[<Instance>]` and `{instances: [<Instance>]}` shapes; only the
// `url` field is required, everything else is best-effort.
func FetchList(ctx context.Context, sourceURL string, timeout time.Duration) ([]Instance, error) {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	tctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(tctx, "GET", sourceURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("user-agent", "snag-cli/0.1.0 (instance-discovery)")
	req.Header.Set("accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("source returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB cap
	if err != nil {
		return nil, err
	}

	// try the array shape first, then the wrapped shape.
	var list []Instance
	if err := json.Unmarshal(body, &list); err == nil && len(list) > 0 {
		return cleanInstances(list), nil
	}
	var wrap struct {
		Instances []Instance `json:"instances"`
	}
	if err := json.Unmarshal(body, &wrap); err == nil && len(wrap.Instances) > 0 {
		return cleanInstances(wrap.Instances), nil
	}
	// some lists key the URL as "api"; tolerate that too.
	var altList []struct {
		API     string   `json:"api"`
		URL     string   `json:"url"`
		Version string   `json:"version"`
		Services []string `json:"services"`
	}
	if err := json.Unmarshal(body, &altList); err == nil {
		conv := make([]Instance, 0, len(altList))
		for _, a := range altList {
			u := a.URL
			if u == "" {
				u = a.API
			}
			if u == "" {
				continue
			}
			conv = append(conv, Instance{URL: u, Version: a.Version, Services: a.Services})
		}
		if len(conv) > 0 {
			return cleanInstances(conv), nil
		}
	}
	return nil, errors.New("unrecognised instance list shape")
}

func cleanInstances(in []Instance) []Instance {
	seen := make(map[string]bool, len(in))
	out := make([]Instance, 0, len(in))
	for _, i := range in {
		u := strings.TrimRight(strings.TrimSpace(i.URL), "/")
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		out = append(out, Instance{URL: u, Version: i.Version, Services: i.Services})
	}
	return out
}

// CheckOne pings GET / on an instance and returns latency + parsed info.
// timeout caps the round trip.
func CheckOne(ctx context.Context, url string, timeout time.Duration) CheckResult {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	url = strings.TrimRight(url, "/")
	res := CheckResult{URL: url}

	tctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(tctx, "GET", url+"/", nil)
	if err != nil {
		res.ErrorMsg = err.Error()
		return res
	}
	req.Header.Set("user-agent", "snag-cli/0.1.0 (instance-discovery)")
	req.Header.Set("accept", "application/json")

	t0 := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		res.ErrorMsg = err.Error()
		return res
	}
	res.Latency = time.Since(t0)
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		res.ErrorMsg = fmt.Sprintf("http %d", resp.StatusCode)
		return res
	}
	res.Reachable = true
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return res
	}
	var info struct {
		Snag struct {
			Version  string   `json:"version"`
			Services []string `json:"services"`
		} `json:"snag"`
		Cobalt struct {
			Version  string   `json:"version"`
			Services []string `json:"services"`
		} `json:"cobalt"`
		Git struct {
			Branch string `json:"branch"`
			Commit string `json:"commit"`
		} `json:"git"`
	}
	if err := json.Unmarshal(body, &info); err == nil {
		ver := info.Snag.Version
		svcs := info.Snag.Services
		if ver == "" {
			ver = info.Cobalt.Version
			svcs = info.Cobalt.Services
		}
		res.Version = ver
		res.NumServices = len(svcs)
		res.Branch = info.Git.Branch
		res.Commit = info.Git.Commit
	}
	return res
}

// CheckAll runs CheckOne on every URL with bounded concurrency. results
// are returned sorted by latency ascending, unreachable rows last.
func CheckAll(ctx context.Context, urls []string, timeout time.Duration, concurrency int) []CheckResult {
	if concurrency < 1 {
		concurrency = 4
	}
	out := make([]CheckResult, len(urls))
	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)
	for i, u := range urls {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, url string) {
			defer wg.Done()
			defer func() { <-sem }()
			out[idx] = CheckOne(ctx, url, timeout)
		}(i, u)
	}
	wg.Wait()
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Reachable != out[j].Reachable {
			return out[i].Reachable
		}
		return out[i].Latency < out[j].Latency
	})
	return out
}

// PickBest returns the lowest-latency reachable instance, or "" if none
// were reachable.
func PickBest(results []CheckResult) string {
	for _, r := range results {
		if r.Reachable {
			return r.URL
		}
	}
	return ""
}
