<script lang="ts">
    import { submit, SnagAPIError } from '$lib/api/client';
    import type { SnagResponse, DownloadMode } from '$types/api';
    import { settings, buildRequest } from '$stores/settings.svelte';
    import { enqueueOne } from '$stores/queue.svelte';
    import { processLocally } from '$lib/local-processing/client';
    import { t } from '$lib/i18n/i18n.svelte';
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
    // hold the active handle so we can terminate the worker on unmount
    // and avoid 1 GiB+ heap leaks when the user navigates away mid-remux.
    let lpHandle: import('$lib/local-processing/client').ProcessHandle | null = null;

    // teardown on component destroy: kill the worker and revoke any
    // outstanding blob URL.
    $effect(() => {
        return () => {
            lpHandle?.cancel();
            lpHandle = null;
            if (lpResult) {
                URL.revokeObjectURL(lpResult.blobUrl);
                lpResult = null;
            }
        };
    });

    // shared blob-URL revoker — covers reset(), startLocalProcessing()
    // re-runs, and component teardown. without this, every successful
    // local-processing run pins another blob in heap (~200 MB+ for a
    // 1080p YouTube DASH merge).
    function clearLpResult() {
        if (lpResult) {
            URL.revokeObjectURL(lpResult.blobUrl);
            lpResult = null;
        }
    }

    const trimRe = /^(\d+(\.\d{1,3})?|(\d{1,2}:){1,2}\d{1,2}(\.\d{1,3})?)$/;
    const trimValid = (s: string) => s.length === 0 || trimRe.test(s);

    const modes = $derived<{ value: DownloadMode; label: string }[]>([
        { value: 'auto', label: t('home.mode_auto') },
        { value: 'audio', label: t('home.mode_audio') },
        { value: 'mute', label: t('home.mode_video') }
    ]);

    async function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!url.trim() || busy) return;
        if (!trimValid(trimStart) || !trimValid(trimEnd) || !trimValid(thumbnailAt)) {
            // store the i18n key, not the resolved string, so locale changes
            // re-translate the message reactively at render time.
            errorMsg = 'home.trim_invalid';
            return;
        }

        busy = true;
        response = null;
        errorMsg = '';

        // the input field has a decorative "https://" prefix label, so users
        // usually paste just `imgur.com/...` without a scheme. without a
        // scheme `new URL(...)` throws and the api returns invalid_body.
        // auto-prepend https:// when no scheme is present.
        let cleaned = url.trim();
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
            cleaned = 'https://' + cleaned;
        }

        try {
            const req = buildRequest(cleaned);
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
            errorMsg = e instanceof SnagAPIError ? e.code : 'home.unexpected_error';
        } finally {
            busy = false;
        }
    }

    function reset() {
        response = null;
        errorMsg = '';
        // cancel any in-flight worker before nuking the blob — otherwise
        // a slow worker could deliver bytes and create yet another URL.
        lpHandle?.cancel();
        lpHandle = null;
        clearLpResult();
        lpRunning = false;
        lpPhase = '';
        lpError = '';
    }

    async function startLocalProcessing() {
        if (!response || response.status !== 'local-processing' || lpRunning) return;
        // user is re-running (e.g. via "try again" after an error). free
        // the prior blob and cancel any zombie worker before starting
        // fresh — see clearLpResult comment above.
        lpHandle?.cancel();
        clearLpResult();
        lpError = '';
        lpRunning = true;
        lpPhase = 'starting…';
        try {
            lpHandle = processLocally(response, (phase) => {
                lpPhase = phase;
            });
            lpResult = await lpHandle.promise;
            lpPhase = 'done';
        } catch (err) {
            lpError = err instanceof Error ? err.message : String(err);
        } finally {
            lpHandle = null;
            lpRunning = false;
        }
    }

    function setMode(m: DownloadMode) {
        settings.downloadMode = m;
    }

    // saving state for the fetch-to-blob path. shown next to the link
    // so the user knows the click is doing something for slow downloads.
    let saving = $state(false);

    // intercept clicks on the result link and force a real download.
    //
    // why: the html5 `download` attribute is silently ignored by browsers
    // for cross-origin urls (security: prevents arbitrary sites from
    // force-downloading attacker-chosen filenames from third-party CDNs).
    // for `redirect` responses we hand back the source CDN url directly,
    // which is cross-origin → the attribute does nothing → click just
    // navigates → some browsers (Dex, Brave with shields, corp-network
    // proxies) block the inline video load with "Access denied".
    //
    // fix: fetch the bytes ourselves, wrap them in a same-origin Blob, and
    // synthesise an `<a download>` click. this matches what cobalt.tools
    // does. tunnel responses are already same-origin (`localhost:9000/...`)
    // and serve a proper Content-Disposition, so we skip the trick there.
    //
    // graceful fallback: if fetch fails (CORS denied, network error), we
    // fall back to the default navigation behavior — same as today.
    async function handleDownloadClick(e: MouseEvent) {
        if (!response) return;
        if (response.status !== 'redirect') return;

        // let middle-click / cmd-click / ctrl-click open in a new tab as
        // the user clearly asked for that.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        if (saving) return;

        const targetUrl = response.url;
        const filename = response.filename ?? 'download';

        try {
            saving = true;
            const r = await fetch(targetUrl);
            if (!r.ok) throw new Error(`fetch ${r.status}`);
            const blob = await r.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // give the browser a beat to attach the blob to the download
            // before we revoke it.
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            // CORS denied or network error → fall back to plain navigate
            // so at least the user gets the source CDN page.
            console.warn('save-as failed, falling back to navigation:', err);
            window.location.href = targetUrl;
        } finally {
            saving = false;
        }
    }
</script>

<div class="hero">
    <section class="copy">
        <h1 class="headline">
            {t('home.headline_prefix')}
            <span class="accent">{t('home.headline_accent')}</span>.<br />
            {t('home.headline_handle')}
        </h1>
        <p class="subline">
            <span class="script"
                >{t('home.subline_text')}
                <span class="underlined">{t('home.subline_places')}</span>.</span
            >
        </p>
    </section>

    <section class="action">
        {#if response && response.status !== 'error'}
            <div class="result">
                {#if response.status === 'redirect' || response.status === 'tunnel'}
                    <p class="result-label tracked">{t('home.result_ready')}</p>
                    <a
                        class="result-link"
                        href={response.url}
                        download={response.filename ?? ''}
                        onclick={handleDownloadClick}
                    >
                        <span class="filename">{response.filename ?? 'download'}</span>
                        <span class="result-arrow" aria-hidden="true"
                            >{saving ? '…' : '→'}</span
                        >
                    </a>
                {:else if response.status === 'picker'}
                    <Picker {response} />
                {:else if response.status === 'local-processing'}
                    <p class="result-label tracked">{t('home.lp_label')}</p>
                    <p class="hint">
                        {response.tunnel.length === 1
                            ? t('home.lp_summary_one', { n: 1, type: response.type })
                            : t('home.lp_summary_many', {
                                  n: response.tunnel.length,
                                  type: response.type
                              })}
                    </p>
                    {#if lpResult}
                        <a class="result-link" href={lpResult.blobUrl} download={lpResult.filename}>
                            <span class="filename">{lpResult.filename}</span>
                            <span class="result-arrow" aria-hidden="true">&rarr;</span>
                        </a>
                    {:else if lpRunning}
                        <p class="status mono">{lpPhase}</p>
                    {:else if lpError}
                        <p class="error-code mono">
                            {t('home.lp_failed_prefix')}
                            {lpError}
                        </p>
                        <button type="button" class="reset tracked" onclick={startLocalProcessing}>
                            {t('home.lp_try_again')}
                        </button>
                    {:else}
                        <button type="button" class="lp-go tracked" onclick={startLocalProcessing}>
                            {t('home.lp_run')}
                        </button>
                    {/if}
                    <details class="streams-details">
                        <summary class="tracked">{t('home.lp_raw_streams')}</summary>
                        <ul class="streams mono">
                            {#each response.tunnel as tunnelUrl, i}
                                <li>
                                    <a href={tunnelUrl} download>
                                        {t('home.lp_stream_label', { n: i + 1 })}
                                    </a>
                                </li>
                            {/each}
                        </ul>
                    </details>
                {/if}
                <button class="reset tracked" onclick={reset}>{t('home.result_start_over')}</button>
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
                        aria-label={t('home.url_aria')}
                    />
                    <button
                        class="go"
                        type="submit"
                        disabled={busy || !url.trim()}
                        aria-label={t('home.submit_aria')}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.4"
                        >
                            <line x1="5" y1="12" x2="18" y2="12" stroke-linecap="round" />
                            <polyline
                                points="12 6 18 12 12 18"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
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
                        {advancedOpen ? t('home.advanced_hide') : t('home.advanced_show')}
                        <span class="adv-arrow" aria-hidden="true">{advancedOpen ? '−' : '+'}</span>
                    </button>

                    {#if advancedOpen}
                        <div class="advanced-panel">
                            <div class="trim-row">
                                <label class="trim-field">
                                    <span class="trim-label tracked"
                                        >{t('home.advanced_trim_start')}</span
                                    >
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
                                    <span class="trim-label tracked"
                                        >{t('home.advanced_trim_end')}</span
                                    >
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
                                <span class="trim-label tracked"
                                    >{t('home.advanced_thumbnail')}</span
                                >
                                <input
                                    type="text"
                                    class="trim-input mono"
                                    bind:value={thumbnailAt}
                                    placeholder={t('home.advanced_thumbnail_placeholder')}
                                    autocomplete="off"
                                    spellcheck="false"
                                    maxlength="16"
                                    disabled={busy}
                                />
                            </label>
                            <p class="adv-note">
                                {t('home.advanced_help_prefix')}
                                <span class="mono">ss</span>,
                                <span class="mono">mm:ss</span>{t('home.advanced_help_join')}
                                <span class="mono">hh:mm:ss</span>{t('home.advanced_help_suffix')}
                                <a href="/settings">{t('home.advanced_help_settings_link')}</a>.
                            </p>
                        </div>
                    {/if}
                </div>

                {#if busy}
                    <p class="status mono">{t('home.fetching')}</p>
                {/if}
            </form>
        {/if}

        {#if errorMsg}
            <div class="error">
                <p class="result-label tracked">{t('home.result_error')}</p>
                <p class="error-message">{t(errorMsg)}</p>
                <p class="error-code mono">{errorMsg}</p>
                <button class="reset tracked" onclick={reset}>{t('home.result_dismiss')}</button>
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

    .error-message {
        margin: 0 0 0.4rem;
        color: var(--text);
        font-size: 1.05rem;
        line-height: 1.4;
    }

    .error-code {
        margin: 0;
        color: var(--error);
        font-size: 0.75rem;
        opacity: 0.7;
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
