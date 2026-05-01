// Package config resolves runtime configuration from flags, env, and
// the on-disk per-user config (managed via the instance package).
// Precedence is flag > env > config file > built-in default.
package config

import (
	"os"
	"strings"

	"github.com/snag/snag-cli/internal/instance"
)

// Config is the runtime configuration for snag-cli.
type Config struct {
	Instance string // base URL of the Snag API to talk to
	APIKey   string // optional Api-Key for authenticated instances
}

// builtin default — only used when nothing else resolves.
const defaultInstance = "http://localhost:9000"

// Resolve fills the Config with values from config file + env. Flags
// override these afterwards in the cobra command setup.
func Resolve() Config {
	c := Config{Instance: defaultInstance}

	// user config — lowest priority above the built-in default.
	if uc, err := instance.LoadConfig(); err == nil && uc.Pinned != "" {
		c.Instance = strings.TrimRight(uc.Pinned, "/")
	}

	// env — overrides the config file.
	if v := os.Getenv("SNAG_INSTANCE"); v != "" {
		c.Instance = strings.TrimRight(v, "/")
	}
	if v := os.Getenv("SNAG_API_KEY"); v != "" {
		c.APIKey = v
	}
	return c
}
