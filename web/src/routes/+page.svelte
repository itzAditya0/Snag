<script lang="ts">
    import { submit, SnagAPIError } from '$lib/api/client';
    import type { SnagResponse, DownloadMode } from '$types/api';
    import { settings, buildRequest } from '$stores/settings.svelte';
    import { enqueueOne } from '$stores/queue.svelte';
    import { processLocally } from '$lib/local-processing/client';
    import Picker from '$components/picker/Picker.svelte';

    let url = $state('');
    let busy = $state(false);
    let response: SnagResponse | null = $state(null);
    let errorMsg = $state('');
    let advancedOpen = $state(false);
    let trimStart = $state('');
    let trimEnd = $state('');
    let thumbnailAt = $state('');

    // local-processing UI state
    let lpRunning = $state(false);
    let lpPhase = $state('');
    let lpResult = $state<{ blobUrl: string; filename: string } | null>(null);
    let lpError = $state('');

    const trimRe = /^(\d+(\.\d{1,3})?|(\d{1,2}:){1,2}\d{1,2}(\.\d{1,3})?)$/;
    const trimValid = (s: string) => s.length === 0 || trimRe.test(s);

    const modes: { value: DownloadMode; label: string }[] = [
        { value: 'auto', label: 'auto' },
        { value: 'audio', label: 'audio' },
        { value: 'mute', label: 'video' }
    ];

    async function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!url.trim() || busy) return;
        if (!trimValid(trimStart) || !trimValid(trimEnd) || !trimValid(thumbnailAt)) {
            errorMsg = 'invalid time format. use ss, mm:ss, or hh:mm:ss';
            return;
        }

        busy = true;
        response = null;
        errorMsg = '';

        try {
            const req = buildRequest(url.trim());
            if (trimStart.trim()) req.trimStart = trimStart.trim();
            if (trimEnd.trim()) req.trimEnd = trimEnd.trim();
            if (thumbnailAt.trim()) req.thumbnailAt = thumbnailAt.trim();
            response = await submit(req);
            if (response.status === 'error') {
                errorMsg = response.error.code;
            } else {
                // mirror successful submissions into the queue so /history
                // shows them. options are stored without the url so retries
                // can re-issue the same request shape.
                const { url: _u, ...opts } = req;
                enqueueOne(req.url, opts);
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
        if (lpResult) {
            URL.revokeObjectURL(lpResult.blobUrl);
        }
        lpResult = null;
        lpRunning = false;
        lpPhase = '';
        lpError = '';
    }

    async function startLocalProcessing() {
        if (!response || response.status !== 'local-processing' || lpRunning) return;
        lpError = '';
        lpResult = null;
        lpRunning = true;
        lpPhase = 'starting…';
        try {
            const handle = processLocally(response, (phase) => {
                lpPhase = phase;
            });
            lpResult = await handle.promise;
            lpPhase = 'done';
        } catch (err) {
            lpError = err instanceof Error ? err.message : String(err);
        } finally {
            lpRunning = false;
        }
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
                    <p class="result-label tracked">in-browser processing</p>
                    <p class="hint">
                        {response.tunnel.length} stream{response.tunnel.length === 1 ? '' : 's'} to
                        merge ({response.type}). nothing leaves your device.
                    </p>
                    {#if lpResult}
                        <a class="result-link" href={lpResult.blobUrl} download={lpResult.filename}>
                            <span class="filename">{lpResult.filename}</span>
                            <span class="result-arrow" aria-hidden="true">&rarr;</span>
                        </a>
                    {:else if lpRunning}
                        <p class="status mono">{lpPhase}</p>
                    {:else if lpError}
                        <p class="error-code mono">local-processing failed: {lpError}</p>
                        <button type="button" class="reset tracked" onclick={startLocalProcessing}>
                            try again
                        </button>
                    {:else}
                        <button type="button" class="lp-go tracked" onclick={startLocalProcessing}>
                            run in this tab &rarr;
                        </button>
                    {/if}
                    <details class="streams-details">
                        <summary class="tracked">or grab the raw streams</summary>
                        <ul class="streams mono">
                            {#each response.tunnel as t, i}
                                <li><a href={t} download>stream {i + 1}</a></li>
                            {/each}
                        </ul>
                    </details>
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

                <div class="advanced">
                    <button
                        type="button"
                        class="advanced-toggle tracked"
                        onclick={() => (advancedOpen = !advancedOpen)}
                        aria-expanded={advancedOpen}
                    >
                        {advancedOpen ? 'hide' : 'show'} advanced
                        <span class="adv-arrow" aria-hidden="true">{advancedOpen ? '−' : '+'}</span>
                    </button>

                    {#if advancedOpen}
                        <div class="advanced-panel">
                            <div class="trim-row">
                                <label class="trim-field">
                                    <span class="trim-label tracked">trim start</span>
                                    <input
                                        type="text"
                                        class="trim-input mono"
                                        bind:value={trimStart}
                                        placeholder="00:00:10"
                                        autocomplete="off"
                                        spellcheck="false"
                                        maxlength="16"
                                        disabled={busy}
                                    />
                                </label>
                                <label class="trim-field">
                                    <span class="trim-label tracked">trim end</span>
                                    <input
                                        type="text"
                                        class="trim-input mono"
                                        bind:value={trimEnd}
                                        placeholder="00:00:30"
                                        autocomplete="off"
                                        spellcheck="false"
                                        maxlength="16"
                                        disabled={busy}
                                    />
                                </label>
                            </div>
                            <label class="trim-field">
                                <span class="trim-label tracked">grab a single frame at</span>
                                <input
                                    type="text"
                                    class="trim-input mono"
                                    bind:value={thumbnailAt}
                                    placeholder="00:00:30 — overrides trim, returns one JPEG"
                                    autocomplete="off"
                                    spellcheck="false"
                                    maxlength="16"
                                    disabled={busy}
                                />
                            </label>
                            <p class="adv-note">
                                times use <span class="mono">ss</span>, <span class="mono">mm:ss</span>,
                                or <span class="mono">hh:mm:ss</span>. for codec / container /
                                resize / output kind / loudnorm, see <a href="/settings">settings</a>.
                            </p>
                        </div>
                    {/if}
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
        grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
        gap: 3rem;
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
        font-size: clamp(2.2rem, 5vw, 4.5rem);
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

    .advanced {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 0.25rem;
    }

    .advanced-toggle {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--text-muted);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        transition: color 0.15s var(--ease);
    }

    .advanced-toggle:hover {
        color: var(--text);
    }

    .adv-arrow {
        font-family: var(--font-mono);
        font-size: 0.85rem;
        line-height: 1;
        opacity: 0.7;
    }

    .advanced-panel {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding-top: 0.4rem;
    }

    .trim-row {
        display: flex;
        gap: 0.75rem;
    }

    .trim-field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        flex: 1;
    }

    .trim-label {
        color: var(--text-muted);
    }

    .trim-input {
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--line-strong);
        color: var(--text);
        font-size: 0.9rem;
        padding: 0.3rem 0;
        transition: border-color 0.15s var(--ease);
    }

    .trim-input:focus {
        outline: none;
        border-bottom-color: var(--text);
    }

    .trim-input:disabled {
        opacity: 0.5;
    }

    .adv-note {
        margin: 0.2rem 0 0;
        font-size: 0.78rem;
        color: var(--text-muted);
        line-height: 1.5;
    }

    .adv-note .mono {
        color: var(--text-soft);
    }

    .adv-note a {
        color: var(--accent);
        border-bottom: 1px solid var(--accent-soft);
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

    .lp-go {
        align-self: flex-start;
        padding: 0.5rem 0.85rem;
        background: var(--text);
        color: var(--bg);
        border-radius: 0.2rem;
        cursor: pointer;
        transition: opacity 0.15s var(--ease);
    }

    .lp-go:hover {
        opacity: 0.85;
    }

    .streams-details {
        margin-top: 0.25rem;
    }

    .streams-details summary {
        cursor: pointer;
        color: var(--text-muted);
        list-style: none;
        padding: 0.3rem 0;
    }

    .streams-details summary::-webkit-details-marker {
        display: none;
    }

    .streams-details summary::before {
        content: "+ ";
    }

    .streams-details[open] summary::before {
        content: "− ";
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
