<script lang="ts">
    import { submit, SnagAPIError } from '$lib/api/client';
    import type { SnagResponse, DownloadMode } from '$types/api';
    import { settings, buildRequest } from '$stores/settings.svelte';
    import Picker from '$components/picker/Picker.svelte';

    let url = $state('');
    let busy = $state(false);
    let response: SnagResponse | null = $state(null);
    let errorMsg = $state('');

    const modes: { value: DownloadMode; label: string }[] = [
        { value: 'auto', label: 'auto' },
        { value: 'audio', label: 'audio' },
        { value: 'mute', label: 'video' }
    ];

    async function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!url.trim() || busy) return;

        busy = true;
        response = null;
        errorMsg = '';

        try {
            response = await submit(buildRequest(url.trim()));
            if (response.status === 'error') {
                errorMsg = response.error.code;
            }
        } catch (e) {
            errorMsg = e instanceof SnagAPIError ? e.code : 'unexpected.error';
        } finally {
            busy = false;
        }
    }

    function reset() {
        response = null;
        errorMsg = '';
    }

    function setMode(m: DownloadMode) {
        settings.downloadMode = m;
    }
</script>

<div class="hero">
    <section class="copy">
        <h1 class="headline">
            Paste a <span class="accent">link</span>.<br />
            We&rsquo;ll handle the rest.
        </h1>
        <p class="subline">
            <span class="script">any video, audio, or photo &mdash; from 20+ <span class="underlined">places</span>.</span>
        </p>
    </section>

    <section class="action">
        {#if response && response.status !== 'error'}
            <div class="result">
                {#if response.status === 'redirect' || response.status === 'tunnel'}
                    <p class="result-label tracked">your file is ready</p>
                    <a class="result-link" href={response.url} download={response.filename ?? ''}>
                        <span class="filename">{response.filename ?? 'download'}</span>
                        <span class="result-arrow" aria-hidden="true">&rarr;</span>
                    </a>
                {:else if response.status === 'picker'}
                    <Picker {response} />
                {:else if response.status === 'local-processing'}
                    <p class="result-label tracked">in-browser processing required</p>
                    <p class="hint">
                        {response.tunnel.length} streams to merge. client-side FFmpeg-WASM is on
                        the roadmap. for now, set <a href="/settings">local processing</a> to
                        <code>disabled</code> to have the server merge for you, or download the
                        streams individually:
                    </p>
                    <ul class="streams mono">
                        {#each response.tunnel as t, i}
                            <li><a href={t} download>stream {i + 1}</a></li>
                        {/each}
                    </ul>
                {/if}
                <button class="reset tracked" onclick={reset}>start over</button>
            </div>
        {:else}
            <form class="form" onsubmit={onSubmit}>
                <div class="input-row">
                    <span class="prefix mono" aria-hidden="true">https://</span>
                    <input
                        type="text"
                        class="url-input mono"
                        bind:value={url}
                        disabled={busy}
                        autocomplete="off"
                        spellcheck="false"
                        autocapitalize="off"
                        aria-label="paste a URL"
                    />
                    <button class="go" type="submit" disabled={busy || !url.trim()} aria-label="submit">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4">
                            <line x1="5" y1="12" x2="18" y2="12" stroke-linecap="round" />
                            <polyline points="12 6 18 12 12 18" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </button>
                </div>

                <div class="modes mono" role="radiogroup" aria-label="download mode">
                    {#each modes as m, i}
                        <button
                            type="button"
                            class="mode"
                            class:active={settings.downloadMode === m.value}
                            role="radio"
                            aria-checked={settings.downloadMode === m.value}
                            onclick={() => setMode(m.value)}
                            disabled={busy}
                        >{m.label}</button>
                        {#if i < modes.length - 1}
                            <span class="dot" aria-hidden="true">·</span>
                        {/if}
                    {/each}
                </div>

                {#if busy}
                    <p class="status mono">fetching…</p>
                {/if}
            </form>
        {/if}

        {#if errorMsg}
            <div class="error">
                <p class="result-label tracked">error</p>
                <p class="error-code mono">{errorMsg}</p>
                <button class="reset tracked" onclick={reset}>dismiss</button>
            </div>
        {/if}
    </section>
</div>

<style>
    .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        gap: 4rem;
        align-items: center;
        min-height: 60vh;
        padding: 2rem 0 4rem;
    }

    /* ---------- left column: copy ---------- */
    .copy {
        display: flex;
        flex-direction: column;
        gap: 2.25rem;
    }

    .headline {
        font-family: var(--font-sans);
        font-weight: 500;
        font-size: clamp(2.5rem, 6vw, 5.25rem);
        line-height: 1.05;
        letter-spacing: -0.025em;
        margin: 0;
        color: var(--text);
    }

    .accent {
        color: var(--accent);
        font-weight: 400;
    }

    .subline {
        margin: 0;
        max-width: 38rem;
    }

    .script {
        font-family: var(--font-script);
        font-size: clamp(1.2rem, 1.8vw, 1.55rem);
        line-height: 1.4;
        color: var(--text-soft);
        font-weight: 500;
    }

    .underlined {
        text-decoration: underline;
        text-decoration-color: var(--accent-soft);
        text-decoration-thickness: 1px;
        text-underline-offset: 0.2em;
    }

    /* ---------- right column: action ---------- */
    .action {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .input-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding-bottom: 0.6rem;
        border-bottom: 1px solid var(--text);
        transition: border-color 0.18s var(--ease);
    }

    .input-row:focus-within {
        border-bottom-color: var(--accent);
    }

    .prefix {
        color: var(--text-muted);
        font-size: 0.95rem;
        flex-shrink: 0;
    }

    .url-input {
        flex: 1;
        min-width: 0;
        font-size: 0.95rem;
        color: var(--text);
        padding: 0.25rem 0;
        background: transparent;
    }

    .url-input::placeholder {
        color: var(--text-faint);
    }

    .url-input:disabled {
        opacity: 0.5;
    }

    .go {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid var(--text-muted);
        border-radius: 50%;
        color: var(--text);
        transition: border-color 0.18s var(--ease), color 0.18s var(--ease), transform 0.18s var(--ease);
        flex-shrink: 0;
    }

    .go:not(:disabled):hover {
        border-color: var(--text);
        transform: translateX(2px);
    }

    .go:disabled {
        color: var(--text-faint);
        border-color: var(--line-strong);
        cursor: not-allowed;
    }

    .modes {
        display: flex;
        align-items: baseline;
        gap: 0.55rem;
        font-size: 0.85rem;
    }

    .mode {
        color: var(--text-muted);
        padding-bottom: 0.2rem;
        border-bottom: 1px solid transparent;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
        font-family: inherit;
        font-size: inherit;
    }

    .mode:hover:not(:disabled) {
        color: var(--text);
    }

    .mode.active {
        color: var(--text);
        border-bottom-color: var(--text);
    }

    .mode:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .dot {
        color: var(--text-faint);
        user-select: none;
    }

    .status {
        color: var(--text-muted);
        font-size: 0.8rem;
        letter-spacing: 0.04em;
    }

    /* ---------- result + error ---------- */
    .result,
    .error {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.5rem 0;
        border-top: 1px solid var(--line-strong);
    }

    .result-label {
        margin: 0;
        color: var(--text-muted);
    }

    .result-link {
        display: inline-flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.6rem 0;
        border-bottom: 1px solid var(--text);
        color: var(--text);
        font-size: 1rem;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .result-link:hover {
        color: var(--accent);
        border-bottom-color: var(--accent);
    }

    .filename {
        word-break: break-all;
        font-weight: 400;
    }

    .result-arrow {
        flex-shrink: 0;
        font-size: 1.1rem;
    }

    .hint {
        margin: 0;
        color: var(--text-soft);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .hint code {
        padding: 0.05em 0.3em;
        background: var(--surface);
        border-radius: 0.2em;
        font-size: 0.85em;
    }

    .hint a {
        color: var(--accent);
        border-bottom: 1px solid var(--accent-soft);
    }

    .streams {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-size: 0.85rem;
    }

    .streams a {
        color: var(--text-soft);
        border-bottom: 1px solid var(--line-strong);
        padding-bottom: 0.1rem;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .streams a:hover {
        color: var(--accent);
        border-bottom-color: var(--accent);
    }

    .reset {
        align-self: flex-start;
        color: var(--text-muted);
        padding-bottom: 0.15rem;
        border-bottom: 1px solid var(--line-strong);
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .reset:hover {
        color: var(--text);
        border-bottom-color: var(--text);
    }

    .error-code {
        margin: 0;
        color: var(--error);
        font-size: 0.85rem;
    }

    /* ---------- responsive ---------- */
    @media (max-width: 900px) {
        .hero {
            grid-template-columns: 1fr;
            gap: 3rem;
            min-height: auto;
        }

        .copy {
            gap: 1.5rem;
        }
    }
</style>
