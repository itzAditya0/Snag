// minimal typed translation system for snag.
//
// design rules:
//   - svelte 5 runes (`$state`) so any component reading `t(...)`
//     re-renders when the active locale changes.
//   - static imports of every locale JSON. small bundle cost; lets the
//     type system see the full key set.
//   - `t(key, vars?)` does {placeholder} interpolation with simple
//     replacement. unknown keys fall back to en, then to the literal key.
//   - active locale persisted in localStorage. on first run we sniff
//     navigator.language and pick a known locale, defaulting to en.

import { browser } from '$app/environment';
import en from './locales/en.json';

// locale dictionaries are strongly typed against en; new locales must
// match the full shape. add more entries here as translation files land.
export type Dict = typeof en;
const dicts = { en } as const satisfies Record<string, Dict>;

export type Locale = keyof typeof dicts;
const STORAGE_KEY = 'snag.locale.v1';

function detectInitial(): Locale {
    if (!browser) return 'en';
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored in dicts) return stored as Locale;
    } catch {
        /* private mode etc. */
    }
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang && browserLang in dicts) return browserLang as Locale;
    return 'en';
}

export const i18n = $state<{ locale: Locale }>({ locale: detectInitial() });

function getNested(obj: unknown, path: string): unknown {
    return path
        .split('.')
        .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const v = vars[name];
        return v === undefined ? `{${name}}` : String(v);
    });
}

/**
 * Translate a dotted key into the active locale's string, with optional
 * `{var}` interpolation. Falls back to the en dictionary then to the
 * literal key when nothing matches — so a missing translation is loud
 * (the key shows up in the UI) but not fatal.
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
    const active = dicts[i18n.locale] as unknown;
    let val = getNested(active, key);
    if (typeof val !== 'string') {
        val = getNested(dicts.en, key);
    }
    if (typeof val !== 'string') return key;
    return interpolate(val, vars);
}

export function setLocale(loc: string): boolean {
    if (!(loc in dicts)) return false;
    i18n.locale = loc as Locale;
    if (browser) {
        try {
            localStorage.setItem(STORAGE_KEY, loc);
        } catch {
            /* ignore */
        }
    }
    return true;
}

export function availableLocales(): Locale[] {
    return Object.keys(dicts) as Locale[];
}
