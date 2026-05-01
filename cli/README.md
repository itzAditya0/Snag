# snag-cli

terminal companion to the [snag web frontend](../web/). same backend, single
static binary, no browser required.

```sh
snag https://www.youtube.com/watch?v=dQw4w9WgXcQ
snag <url> --audio
snag <url> --trim 00:01:23 --trim-end 00:01:33 -o ./clip.mp4
snag <url> --resize 720 --codec h265 --container mkv
snag batch urls.txt --concurrency 8 --out-dir ./downloads
snag info
snag instances pick https://your-snag-instance.example.com
```

## install (from source)

```sh
cd cli
go build -o snag ./cmd/snag
./snag --help
```

cross-compile via `GOOS=... GOARCH=... go build`.

## configuration

| flag                  | env             | default                     |
|-----------------------|-----------------|-----------------------------|
| `--instance <url>`    | `SNAG_INSTANCE` | `http://localhost:9000`     |
| `--api-key <key>`     | `SNAG_API_KEY`  | _(none)_                    |
| `--output <path>`     | _n/a_           | sensible filename in `pwd`  |
| `--quiet`             | _n/a_           | shows a progress bar        |

flags override env variables. a pinned instance from `snag instances pick`
sits between the env var and the built-in default.

## resumable downloads

if a `snag <url>` invocation is interrupted (Ctrl+C, lost network, server
killed), the partial result lives at `<output>.part`. running the same
command again sends an HTTP `Range:` header from the partial size and
appends the rest. on the rare server that doesn't support range, snag
truncates the `.part` and re-fetches from byte 0 cleanly.

resume is verified byte-identical on the happy path: a download
interrupted at ~28% of a 3.4 MB YouTube audio track resumes and finishes
with a sha256 matching a fresh full download.

### known limitations

- **source content change isn't detected.** if the upstream media file
  changes between the original and the resumed fetch (very rare for a
  given video URL, but possible), snag has no way to spot the
  inconsistency and the resumed file will be a corrupt concatenation.
  delete the `.part` and re-run if you suspect this.
- **`<output>.part` is keyed by the resolved final filename**, which
  comes from the API. if the API renames the file between runs (e.g.
  metadata source updated the title), the resume path won't see the
  prior `.part`.

## batch downloads

`snag batch <file>` reads URLs (one per line, blank lines and `#` comments
skipped) and downloads them in parallel. use `-` for stdin so you can
pipe URLs in from another tool.

```sh
snag batch urls.txt --audio --out-dir ./downloads
cat urls.txt | snag batch - --concurrency 8 --quality 720
```

per-URL failures don't abort the batch by default. exit code is 1 when
any URL fails so scripts can detect partial success.

## instance discovery

`snag instances` manages which Snag API the CLI talks to.

```sh
snag instances pick https://your-instance.example.com
snag instances unpin
snag instances source add https://example.com/snag-instances.json
snag instances refresh   # pull the source list
snag instances ping      # live latency check across known instances
```

instance source URLs are restricted to `http`/`https` so a typoed
`file://` path can't escape into a local-file read.

## license

AGPL-3.0, same as the rest of the snag monorepo.
