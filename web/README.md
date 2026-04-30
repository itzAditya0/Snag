# snag web

the snag web frontend — paste a link, get the file. talks to the [snag api](../api/) over HTTP.

built with [SvelteKit](https://svelte.dev/docs/kit/introduction) + TypeScript. licensed under [AGPL-3.0](./LICENSE).

> the original cobalt web frontend is licensed under CC-BY-NC-SA 4.0 (non-commercial). this directory is an
> independent reimplementation. no cobalt frontend code, copy, or assets are reused here.

## development

```sh
pnpm install
pnpm --filter @snag/web dev
```

defaults to `http://localhost:5173`. the api endpoint is configurable via `VITE_API_URL` (defaults to
`http://localhost:9000` for local dev).

## build

```sh
pnpm --filter @snag/web build
pnpm --filter @snag/web preview
```

uses `@sveltejs/adapter-auto` so deployment target is auto-detected. swap to `adapter-static` or
`adapter-node` for explicit static or self-hosted deployments.

## structure

```
src/
├── app.html        # HTML shell
├── app.d.ts        # ambient types
├── app.css         # global styles
├── routes/         # SvelteKit routes (pages)
├── components/     # reusable UI components
└── lib/
    ├── api/        # snag API client
    ├── stores/     # svelte stores
    ├── types/      # TS type definitions
    └── env.ts      # env vars and config
```
