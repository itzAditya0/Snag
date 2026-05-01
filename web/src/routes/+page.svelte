<script lang="ts">
    import { submit, SnagAPIError } from '$lib/api/client';
    import type { SnagResponse } from '$types/api';
    import { settings, buildRequest } from '$stores/settings.svelte';

    let url = $state('');
    let busy = $state(false);
    let response: SnagResponse | null = $state(null);
    let errorMsg = $state('');

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
            if (e instanceof SnagAPIError) {
                errorMsg = e.code;
            } else {
                errorMsg = 'unexpected.error';
            }
        } finally {
            busy = false;
        }
    }

    function reset() {
        response = null;
        errorMsg = '';
    }
</script>

<div class="page">
    <h1 class="title">paste a link</h1>
    <p class="subtitle">snag will fetch the media for you. nothing tracked, nothing stored.</p>

    <form class="form" onsubmit={onSubmit}>
        <input
            class="url-input"
            type="url"
            placeholder="https://..."
            bind:value={url}
            disabled={busy}
            autocomplete="off"
            spellcheck="false"
            required
        />

        <div class="mode-row">
            <label class:active={settings.downloadMode === 'auto'}>
                <input
                    type="radio"
                    bind:group={settings.downloadMode}
                    value="auto"
                    disabled={busy}
                />
                auto
            </label>
            <label class:active={settings.downloadMode === 'audio'}>
                <input
                    type="radio"
                    bind:group={settings.downloadMode}
                    value="audio"
                    disabled={busy}
                />
                audio only
            </label>
            <label class:active={settings.downloadMode === 'mute'}>
                <input
                    type="radio"
                    bind:group={settings.downloadMode}
                    value="mute"
                    disabled={busy}
                />
                video, no audio
            </label>
        </div>

        <a class="settings-link" href="/settings">advanced settings &rarr;</a>

        <button class="submit" type="submit" disabled={busy}>
            {busy ? 'fetching…' : 'snag it'}
        </button>
    </form>

    {#if response && response.status !== 'error'}
        <div class="result">
            {#if response.status === 'redirect' || response.status === 'tunnel'}
                <p>your file is ready:</p>
                <a class="download-link" href={response.url} download={response.filename ?? ''}>
                    download {response.filename ?? 'file'}
                </a>
            {:else if response.status === 'picker'}
                <p>this URL contains multiple items. picker UI coming soon.</p>
                <pre>{JSON.stringify(response.picker, null, 2)}</pre>
            {:else if response.status === 'local-processing'}
                <p>this download requires client-side processing. local-processing UI coming soon.</p>
                <pre>{JSON.stringify(response, null, 2)}</pre>
            {/if}
            <button class="reset" onclick={reset}>start over</button>
        </div>
    {/if}

    {#if errorMsg}
        <div class="error">
            <span>error: <code>{errorMsg}</code></span>
            <button class="reset" onclick={reset}>dismiss</button>
        </div>
    {/if}
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.03em;
    }

    .subtitle {
        margin: 0;
        color: var(--text-muted);
        font-size: 1rem;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1rem;
    }

    .url-input {
        width: 100%;
        padding: 0.875rem 1rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-size: 1rem;
        font-family: var(--font-mono);
        transition: border-color 0.15s;
    }

    .url-input:focus {
        outline: none;
        border-color: var(--accent);
    }

    .url-input:disabled {
        opacity: 0.6;
    }

    .mode-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .mode-row label {
        flex: 1;
        min-width: 7rem;
        padding: 0.5rem 0.75rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        text-align: center;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.15s;
    }

    .mode-row label:hover {
        border-color: var(--accent);
    }

    .mode-row label.active {
        background: var(--accent);
        color: var(--accent-text);
        border-color: var(--accent);
    }

    .mode-row input[type='radio'] {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }

    .settings-link {
        align-self: flex-start;
        font-size: 0.85rem;
        color: var(--text-muted);
        text-decoration: none;
    }

    .settings-link:hover {
        color: var(--accent);
        text-decoration: underline;
    }

    .submit {
        padding: 0.875rem 1.5rem;
        background: var(--accent);
        color: var(--accent-text);
        border-radius: var(--radius);
        font-size: 1rem;
        font-weight: 600;
        transition: background 0.15s;
    }

    .submit:hover:not(:disabled) {
        background: var(--accent-hover);
    }

    .submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .result,
    .error {
        margin-top: 1rem;
        padding: 1rem 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .error {
        border-color: var(--error);
        color: var(--error);
    }

    .download-link {
        display: inline-block;
        padding: 0.5rem 0.875rem;
        background: var(--accent);
        color: var(--accent-text);
        border-radius: var(--radius-sm);
        font-weight: 500;
        text-decoration: none;
        align-self: flex-start;
    }

    .download-link:hover {
        background: var(--accent-hover);
        text-decoration: none;
    }

    .reset {
        align-self: flex-start;
        padding: 0.4rem 0.75rem;
        background: var(--surface-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
        color: var(--text-muted);
        transition: color 0.15s;
    }

    .reset:hover {
        color: var(--text);
    }

    pre {
        margin: 0;
        padding: 0.75rem;
        background: var(--surface-elevated);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
    }

    code {
        font-size: 0.9em;
    }
</style>
