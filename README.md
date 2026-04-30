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
| [`cli/`](./cli/) | Go command-line client (planned) | AGPL-3.0 |
| [`packages/`](./packages/) | shared workspace packages | AGPL-3.0 / MIT |
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

run an instance:

```sh
docker compose up
```

api docs: [`docs/api.md`](./docs/api.md). environment variables: [`docs/api-env-variables.md`](./docs/api-env-variables.md).

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
