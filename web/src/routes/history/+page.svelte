<script lang="ts">
    import {
        queue,
        enqueueMany,
        retryItem,
        dismissItem,
        clearQueue,
        type QueueStatus
    } from '$stores/queue.svelte';
    import { buildRequest } from '$stores/settings.svelte';

    let bulkText = $state('');
    let bulkOpen = $state(false);
    let processing = $state(false);

    const items = $derived(queue.items);
    const counts = $derived({
        total: items.length,
        ready: items.filter((i) => i.status === 'ready').length,
        active: items.filter((i) => i.status === 'pending' || i.status === 'fetching').length,
        error: items.filter((i) => i.status === 'error').length
    });

    async function onBulkSubmit() {
        const urls = bulkText
            .split(/\r?\n/)
            .map((u) => u.trim())
            .filter((u) => u.length > 0);
        if (urls.length === 0 || processing) return;
        processing = true;
        try {
            // strip the "url" field from buildRequest's output — enqueueMany
            // attaches each url itself.
            const tmpl = buildRequest('');
            const { url: _u, ...opts } = tmpl;
            await enqueueMany(urls, opts);
            bulkText = '';
        } finally {
            processing = false;
        }
    }

    function statusLabel(s: QueueStatus): string {
        return s;
    }

    function formatTime(ts?: number): string {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function shorten(url: string, n = 70): string {
        if (url.length <= n) return url;
        return url.slice(0, n - 1) + '…';
    }
</script>

<div class="page">
    <header class="page-head">
        <div class="head-row">
            <h1 class="title">History.</h1>
            <span class="counter mono">
                {String(counts.ready).padStart(2, '0')} / {String(counts.total).padStart(2, '0')}
            </span>
        </div>
        <p class="lede">
            every download lands here. <span class="italic">resumable, searchable, your device
            only</span> &mdash; nothing is sent to the snag instance.
        </p>
        <div class="head-actions">
            <button
                type="button"
                class="link-btn tracked"
                onclick={() => (bulkOpen = !bulkOpen)}
                aria-expanded={bulkOpen}
            >
                {bulkOpen ? 'hide' : 'add many urls'}
                <span class="adv-arrow" aria-hidden="true">{bulkOpen ? '−' : '+'}</span>
            </button>
            {#if items.length > 0}
                <button type="button" class="link-btn tracked danger" onclick={clearQueue}>
                    clear all
                </button>
            {/if}
        </div>
    </header>

    {#if bulkOpen}
        <section class="bulk">
            <textarea
                class="bulk-input mono"
                bind:value={bulkText}
                placeholder={`paste one URL per line.\nshared options come from /settings.`}
                rows="6"
                disabled={processing}
            ></textarea>
            <div class="bulk-row">
                <span class="bulk-count tracked">
                    {bulkText.split(/\r?\n/).filter((l) => l.trim()).length} urls
                </span>
                <button
                    type="button"
                    class="bulk-go tracked"
                    onclick={onBulkSubmit}
                    disabled={processing || bulkText.trim().length === 0}
                >
                    {processing ? 'fetching…' : 'fetch all'}
                </button>
            </div>
        </section>
    {/if}

    {#if items.length === 0}
        <p class="empty">
            no downloads yet. <a href="/">paste a link</a> to start, or open <em>add many
            urls</em> above.
        </p>
    {:else}
        <ul class="list">
            {#each items as item (item.id)}
                <li class="row" data-status={item.status}>
                    <span
                        class="dot mono status-{item.status}"
                        aria-label={statusLabel(item.status)}
                    >&bull;</span>
                    <div class="meta">
                        <a class="url mono" href={item.url} target="_blank" rel="noreferrer">
                            {shorten(item.url, 90)}
                        </a>
                        <div class="sub mono">
                            {#if item.status === 'pending'}queued{:else if item.status === 'fetching'}fetching…{:else if item.status === 'ready' && item.filename}{item.filename}{:else if item.status === 'ready' && item.pickerCount}{item.pickerCount} item{item.pickerCount === 1 ? '' : 's'} (picker){:else if item.status === 'error'}{item.errorCode ?? 'unknown error'}{:else}ready{/if}
                            <span class="time">&middot; {formatTime(item.completedAt ?? item.submittedAt)}</span>
                        </div>
                    </div>
                    <div class="actions">
                        {#if item.status === 'ready' && item.downloadUrl}
                            <a
                                class="action-btn tracked"
                                href={item.downloadUrl}
                                download={item.filename ?? ''}
                            >download</a>
                        {/if}
                        {#if item.status === 'error'}
                            <button
                                type="button"
                                class="action-btn tracked"
                                onclick={() => retryItem(item.id)}
                            >retry</button>
                        {/if}
                        <button
                            type="button"
                            class="action-btn tracked muted"
                            onclick={() => dismissItem(item.id)}
                            aria-label="remove"
                        >&times;</button>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        padding: 1rem 0 4rem;
    }

    .page-head {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 56rem;
    }

    .head-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
    }

    .title {
        margin: 0;
        font-family: var(--font-sans);
        font-weight: 500;
        font-size: clamp(2.25rem, 4.5vw, 3.5rem);
        line-height: 1;
        letter-spacing: -0.025em;
        color: var(--text);
    }

    .counter {
        color: var(--text-muted);
        font-size: 0.78rem;
    }

    .lede {
        margin: 0;
        font-size: 1rem;
        line-height: 1.55;
        color: var(--text-soft);
        max-width: 36rem;
    }

    .italic {
        font-style: italic;
        color: var(--text);
    }

    .head-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .link-btn {
        background: none;
        border: none;
        color: var(--text-muted);
        padding: 0.2rem 0;
        border-bottom: 1px solid transparent;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .link-btn:hover {
        color: var(--text);
        border-bottom-color: var(--text);
    }

    .link-btn.danger:hover {
        color: var(--error);
        border-bottom-color: var(--error);
    }

    .adv-arrow {
        font-size: 0.85rem;
        opacity: 0.7;
    }

    .bulk {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 56rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--line);
    }

    .bulk-input {
        background: transparent;
        border: 1px solid var(--line-strong);
        color: var(--text);
        padding: 0.75rem 0.85rem;
        font-size: 0.85rem;
        line-height: 1.5;
        border-radius: 0.2rem;
        resize: vertical;
        min-height: 6rem;
    }

    .bulk-input::placeholder {
        color: var(--text-faint);
    }

    .bulk-input:focus {
        outline: none;
        border-color: var(--text);
    }

    .bulk-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .bulk-count {
        color: var(--text-muted);
    }

    .bulk-go {
        background: none;
        border: 1px solid var(--text);
        color: var(--text);
        padding: 0.4rem 0.85rem;
        border-radius: 0.2rem;
        cursor: pointer;
        transition: background 0.15s var(--ease), color 0.15s var(--ease);
    }

    .bulk-go:hover:not(:disabled) {
        background: var(--text);
        color: var(--bg);
    }

    .bulk-go:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .empty {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.95rem;
    }

    .empty a,
    .empty em {
        color: var(--text);
        font-style: normal;
        border-bottom: 1px solid var(--line-strong);
        padding-bottom: 0.05rem;
    }

    .list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-width: 56rem;
    }

    .row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 1rem;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--line);
    }

    .dot {
        font-size: 1rem;
        line-height: 1;
        flex-shrink: 0;
    }

    .status-pending {
        color: var(--text-muted);
        animation: pulse 1.5s ease-in-out infinite;
    }

    .status-fetching {
        color: var(--accent);
        animation: pulse 0.9s ease-in-out infinite;
    }

    .status-ready {
        color: var(--ready);
    }

    .status-error {
        color: var(--error);
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
    }

    .meta {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
    }

    .url {
        font-size: 0.85rem;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .url:hover {
        color: var(--accent);
    }

    .sub {
        font-size: 0.75rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .row[data-status='error'] .sub {
        color: var(--error);
    }

    .time {
        color: var(--text-faint);
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .action-btn {
        background: none;
        border: 1px solid var(--line-strong);
        color: var(--text);
        padding: 0.3rem 0.6rem;
        border-radius: 0.2rem;
        cursor: pointer;
        text-decoration: none;
        transition: border-color 0.15s var(--ease), color 0.15s var(--ease);
    }

    .action-btn:hover {
        border-color: var(--text);
        color: var(--text);
    }

    .action-btn.muted {
        border-color: transparent;
        color: var(--text-muted);
        font-size: 1rem;
        line-height: 1;
        padding: 0.3rem 0.5rem;
    }

    .action-btn.muted:hover {
        color: var(--error);
        border-color: var(--error);
    }

    @media (max-width: 640px) {
        .row {
            grid-template-columns: auto 1fr;
        }

        .actions {
            grid-column: 1 / -1;
            justify-content: flex-end;
        }
    }
</style>
