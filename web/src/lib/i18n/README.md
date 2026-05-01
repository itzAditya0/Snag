# i18n

minimal typed translation system. locale dictionaries are static JSON
imports under `locales/`, the active locale lives in a `$state` rune
(so every component using `t(...)` re-renders on switch), and the
choice persists to `localStorage[snag.locale.v1]`.

## using `t(...)` in a component

```svelte
<script lang="ts">
    import { t } from '$lib/i18n/i18n.svelte';
</script>

<h1>{t('home.headline_prefix')} <span class="accent">{t('home.headline_accent')}</span>.</h1>
<p>{t('home.lp_summary_many', { n: 3, type: 'merge' })}</p>
```

`{var}` placeholders are filled from the second argument. Missing
translations fall back to English, then to the literal key (so
`t('home.does.not.exist')` renders as `home.does.not.exist` and you
can spot the gap in the UI).

## adding a new language

1. Copy `locales/en.json` to `locales/<lang>.json` (ISO 639-1 code).
2. Translate every leaf string. The dictionary shape is enforced by
   TypeScript via `satisfies Record<string, Dict>`, so missing keys
   are caught at build time.
3. Import and register in `i18n.svelte.ts`:
   ```ts
   import en from './locales/en.json';
   import es from './locales/es.json';
   const dicts = { en, es } as const satisfies Record<string, Dict>;
   ```
4. The `setLocale('es')` API and the `availableLocales()` helper pick
   it up automatically.

## conventions

- Keys use `dot.case` and live under a top-level component-or-page name
  (`home.*`, `settings.*`, `nav.*`).
- Reuse keys across components when the string is identical; don't
  duplicate "loading…" in five places.
- For sentence-spanning markup (e.g. an inline accent span around one
  word), split into multiple keys (`headline_prefix`, `headline_accent`,
  `headline_handle`). It's clunkier than one rich-text string but
  removes ambiguity for translators.
- Numbers / placeholders go through `{var}` interpolation, never via
  string concatenation in the template.
- The brand name `snag` and the dictionary `/snæɡ/` etc. are not
  translated — they're proper nouns.

## scope right now

only English ships. The home page (`routes/+page.svelte`) is the only
file that's been migrated to `t(...)` so far — it's the demo. Other
pages still inline their strings; migrating them is straight-forward,
just incremental work.
