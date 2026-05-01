<script lang="ts">
    import { instanceInfo } from '$lib/api/client';
    import { onMount } from 'svelte';

    let info = $state<{
        version?: string;
        services?: string[];
        commit?: string;
        branch?: string;
    } | null>(null);
    let infoError = $state('');
    let infoLoading = $state(true);

    onMount(async () => {
        try {
            const res = await instanceInfo();
            const root = res.snag ?? res.cobalt;
            info = {
                version: root?.version,
                services: root?.services,
                commit: res.git?.commit,
                branch: res.git?.branch
            };
        } catch (e) {
            infoError = e instanceof Error ? e.message : 'unknown error';
        } finally {
            infoLoading = false;
        }
    });
</script>

<div class="page">
    <header class="page-head">
        <h1 class="title">About.</h1>
        <p class="lede">
            snag is a media downloader without the <span class="italic">nonsense</span>. paste a
            link, get a file. nothing tracked, nothing stored.
        </p>
    </header>

    <section class="prose">
        <p>
            snag is a fork of <a href="https://github.com/imputnet/cobalt">cobalt</a> by imput. the
            api server, shared packages, and architectural patterns are inherited under AGPL-3.0.
            the snag web frontend is an independent reimplementation under the same license.
        </p>
    </section>

    <section class="group">
        <h2 class="group-head tracked">this instance</h2>

        {#if infoLoading}
            <p class="row-note mono">connecting…</p>
        {:else if info}
            <div class="row">
                <span class="row-label">version</span>
                <span class="row-value mono">{info.version ?? 'unknown'}</span>
            </div>
            <div class="row">
                <span class="row-label">commit</span>
                <span class="row-value mono">{info.commit?.slice(0, 8) ?? 'unknown'}</span>
            </div>
            <div class="row">
                <span class="row-label">branch</span>
                <span class="row-value mono">{info.branch ?? 'unknown'}</span>
            </div>
            <div class="row services">
                <span class="row-label">services <span class="mono count">({info.services?.length ?? 0})</span></span>
                <span class="row-value services-list mono">
                    {(info.services ?? []).join(' · ')}
                </span>
            </div>
        {:else if infoError}
            <p class="row-note mono error">offline — {infoError}</p>
        {/if}
    </section>

    <section class="group">
        <h2 class="group-head tracked">links</h2>
        <a class="row link-row" href="/about/license">
            <span class="row-label">license</span>
            <span class="row-arrow" aria-hidden="true">&rarr;</span>
        </a>
        <a class="row link-row" href="/about/privacy">
            <span class="row-label">privacy</span>
            <span class="row-arrow" aria-hidden="true">&rarr;</span>
        </a>
        <a class="row link-row" href="https://github.com/imputnet/cobalt">
            <span class="row-label">cobalt — upstream project</span>
            <span class="row-arrow" aria-hidden="true">&nearr;</span>
        </a>
    </section>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 3rem;
        padding: 1rem 0 4rem;
    }

    .page-head {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 42rem;
    }

    .title {
        margin: 0;
        font-family: var(--font-sans);
        font-weight: 500;
        font-size: clamp(2.25rem, 4.5vw, 3.5rem);
        line-height: 1.05;
        letter-spacing: -0.025em;
        color: var(--text);
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

    .prose {
        max-width: 36rem;
    }

    .prose p {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.65;
        color: var(--text-soft);
    }

    .prose a {
        color: var(--text);
        border-bottom: 1px solid var(--line-strong);
        padding-bottom: 0.05rem;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .prose a:hover {
        color: var(--accent);
        border-bottom-color: var(--accent);
    }

    .group {
        display: flex;
        flex-direction: column;
        max-width: 42rem;
    }

    .group-head {
        margin: 0 0 0.5rem;
        color: var(--text-muted);
        font-size: 0.78rem;
        padding-bottom: 0.65rem;
        border-bottom: 1px solid var(--line-strong);
    }

    .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1.5rem;
        padding: 0.85rem 0;
        border-bottom: 1px solid var(--line);
    }

    .row.services {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .row-label {
        color: var(--text);
        font-size: 0.95rem;
        flex-shrink: 0;
    }

    .row-value {
        color: var(--text-soft);
        font-size: 0.85rem;
        text-align: right;
    }

    .services-list {
        text-align: left;
        line-height: 1.7;
        color: var(--text-soft);
        font-size: 0.78rem;
        letter-spacing: 0.04em;
    }

    .count {
        color: var(--text-muted);
        font-size: 0.78rem;
    }

    .link-row {
        cursor: pointer;
        transition: color 0.15s var(--ease);
    }

    .link-row .row-label {
        transition: color 0.15s var(--ease);
    }

    .link-row:hover .row-label {
        color: var(--accent);
    }

    .row-arrow {
        color: var(--text-muted);
        font-size: 0.95rem;
        transition: color 0.15s var(--ease), transform 0.15s var(--ease);
    }

    .link-row:hover .row-arrow {
        color: var(--accent);
        transform: translateX(2px);
    }

    .row-note {
        margin: 0.5rem 0 0;
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    .row-note.error {
        color: var(--error);
    }
</style>
