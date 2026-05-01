// Package config resolves runtime configuration from flags and env.
// Flags take precedence over environment variables.
package config

import (
	"os"
	"strings"
)

// Config is the runtime configuration for snag-cli.
type Config struct {
	Instance string // base URL of the Snag API to talk to
	APIKey   string // optional Api-Key for authenticated instances
}

// Resolve fills the Config with values from env / defaults. Flags
// override these afterwards in the cobra command setup.
func Resolve() Config {
	c := Config{
		Instance: "http://localhost:9000",
	}
	if v := os.Getenv("SNAG_INSTANCE"); v != "" {
		c.Instance = strings.TrimRight(v, "/")
	}
	if v := os.Getenv("SNAG_API_KEY"); v != "" {
		c.APIKey = v
	}
	return c
}
