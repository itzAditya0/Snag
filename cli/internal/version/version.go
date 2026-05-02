package version

// Version is the snag-cli version. Defaults to the in-tree development
// value; release builds override this via:
//
//   go build -ldflags="-X github.com/snag/snag-cli/internal/version.Version=v1.2.3"
//
// (see .github/workflows/cli-release.yml). Must be a `var` so the
// linker can write to it — a `const` gets inlined and the override
// is silently ignored.
var Version = "0.1.0-dev"
