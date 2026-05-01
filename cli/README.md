# snag-cli

terminal companion to the [snag web frontend](../web/). same backend, single
static binary, no browser required.

```sh
snag https://www.youtube.com/watch?v=dQw4w9WgXcQ
snag <url> --audio
snag <url> --trim 00:01:23 --trim-end 00:01:33 -o ./clip.mp4
snag <url> --resize 720 --codec h265 --container mkv
snag info
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

flags override env variables.

## license

AGPL-3.0, same as the rest of the snag monorepo.
