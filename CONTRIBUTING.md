# contributing to snag

snag is open source under AGPL-3.0. contributions are welcome.

## scope

snag is built to fetch **freely accessible public content**. the following will not be accepted:

- support for DRM-protected content
- support for paid or auth-required content where snag would act on behalf of an account
- features that scrape unrelated metadata or user information
- features that exist mainly to bypass platform anti-abuse rather than improve the core download flow

if you're not sure whether something fits, open an issue first and we'll talk.

## branches and commits

- branch off `main` for any change
- one feature or fix per pull request
- commit messages: `<scope>: <imperative description>` — e.g. `api/services: add imgur extractor`,
  `web/settings: add codec dropdown`, `cli/queue: support resume after expired tunnel`
- if you spot a bug in your own commit before review, prefer `git commit --fixup=<hash>` and
  `git rebase -i main --autosquash` over a "fix typo" commit
- rebase when out of date; avoid noisy merge commits in feature branches
- force-push your own branches with `--force-with-lease`

## code style

- the api server runs on Node 18.17+ and uses ES modules. no transpilation step.
- the web frontend is SvelteKit + TypeScript.
- the cli is Go (planned). standard library + cobra/viper.
- match surrounding code conventions before introducing new patterns.

## testing

- api: `pnpm --filter @snag/api test`
- web: `pnpm --filter @snag/web test` (when test setup lands)
- cli: `go test ./...` from `cli/`

## adding a new service handler

new platform extractors live in `api/src/processing/services/<platform>.js`. before opening a PR:

1. confirm the platform is publicly accessible and content is free to fetch
2. follow the existing handler pattern (look at `pinterest.js` or `vimeo.js` for clean references)
3. add URL regexes to `service-patterns.js`
4. register the service in `service-config.js`
5. include sample URLs covering edge cases (deleted content, private/forbidden, multi-item)

## docs

if you change a request schema field, response shape, or env variable, update `docs/api.md` or
`docs/api-env-variables.md` in the same PR.
