# snag

a media downloader that respects you: no ads, no trackers, no logs, no nonsense. paste a link, get the file.

snag is a friendly fork of [cobalt](https://github.com/imputnet/cobalt) with extra features for power users:
a Go CLI, batch downloads, queue with resume, frame-accurate trimming, expanded image-platform support,
distributed instance discovery, and a richer format conversion pipeline.

## monorepo layout

| path | purpose | license |
|---|---|---|
| [`api/`](./api/) | Express API server, the engine that turns links into media | AGPL-3.0 |
| [`web/`](./web/) | SvelteKit web frontend (independent reimplementation) | AGPL-3.0 |
| [`cli/`](./cli/) | `snag` Go command-line client — `brew install itzAditya0/snag/snag` | AGPL-3.0 |
| [`packages/`](./packages/) | shared workspace packages | AGPL-3.0 |
| [`docs/`](./docs/) | how to run an instance, env reference, api reference | AGPL-3.0 |

## what snag does

- pull video, audio, or images from a public URL on any supported service
- offer client-side processing via FFmpeg-WASM where the device can handle it, server-side otherwise
- never store, log, or reuse user content; the server is a strict pass-through

## what snag does not do

- DRM-protected content (Spotify, Netflix, Apple Music, etc.)
- private or auth-required content
- anything that wouldn't be legal to fetch with a browser's dev tools

## getting started

### local development

```sh
pnpm install
cp api/.env.example api/.env

# terminal 1: api server (http://localhost:9000)
pnpm --filter @snag/api start

# terminal 2: web frontend (http://localhost:5173)
pnpm --filter @snag/web dev
```

then open http://localhost:5173, paste a link, hit "snag it".

### production / self-host

```sh
docker compose up
```

api docs: [`docs/api.md`](./docs/api.md). environment variables: [`docs/api-env-variables.md`](./docs/api-env-variables.md).

## the CLI

snag ships a small Go binary that talks to any snag-compatible api. one-shot
downloads, batch from a file, resumable streams, and tunnel-expiry recovery
out of the box.

### install

**homebrew (macOS + linux)** — the recommended path. picks up new releases via
`brew upgrade snag`:

```sh
brew install itzAditya0/snag/snag
```

**prebuilt binaries** — grab the matching tarball/zip for your os/arch from
the [latest release](https://github.com/itzAditya0/Snag/releases/latest).
extract `snag` and drop it on your `$PATH`. supports darwin (intel + apple
silicon), linux (amd64 + arm64), and windows (amd64). every archive has a
matching sha256 in `checksums.txt`.

**from source** — needs Go 1.22+:

```sh
cd cli
go build -o snag ./cmd/snag
```

### use

```sh
# point at your local api (default if SNAG_INSTANCE is unset)
snag https://www.youtube.com/watch?v=dQw4w9WgXcQ

# pin output, request audio-only:
snag https://soundcloud.com/... --audio -o ~/Music/track.opus

# trim, resize, re-encode in one go:
snag https://twitter.com/i/status/... --trim 00:01:23 --trim-end 00:01:33 \
  --resize 720 --codec h265 -o clip.mp4

# bulk download from a file (one URL per line):
snag batch urls.txt --concurrency 4 --out-dir ~/Downloads/snag-batch

# pick a different snag instance:
snag --instance https://snag.example.com <url>
# (or set it once: snag config set instance https://snag.example.com)
```

full reference and flag list: [`cli/README.md`](./cli/README.md).

## ethics

snag is a tool, not a service. you are responsible for the content you fetch and how you use it.
snag is not a piracy tool and refuses to behave like one — it strictly handles publicly accessible
content that any browser could already download.

## origin and credit

snag is a fork of [cobalt by imput](https://github.com/imputnet/cobalt). the cobalt API server,
shared packages, and architectural ideas are inherited under AGPL-3.0. the snag web frontend is an
independent reimplementation under AGPL-3.0; cobalt's web frontend is under CC-BY-NC-SA 4.0 and is
not redistributed here. see [`NOTICE`](./NOTICE) for full attribution.

## license

unless a subdirectory specifies otherwise, snag is licensed under [AGPL-3.0](./LICENSE).
