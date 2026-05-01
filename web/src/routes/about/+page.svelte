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
        }
    });
</script>

<div class="page">
    <h1>about snag</h1>

    <p>
        snag is a no-frills media downloader. paste a public link, get a file. no ads, no trackers,
        no logs, no nonsense.
    </p>

    <p>
        snag is a fork of <a href="https://github.com/imputnet/cobalt">cobalt</a> by imput. cobalt's
        api server, architecture, and most service extractors are inherited under AGPL-3.0. the snag
        web frontend is an independent reimplementation under the same license.
    </p>

    <h2>this instance</h2>

    {#if info}
        <dl class="info">
            <dt>version</dt>
            <dd>{info.version ?? 'unknown'}</dd>

            <dt>commit</dt>
            <dd><code>{info.commit?.slice(0, 8) ?? 'unknown'}</code></dd>

            <dt>branch</dt>
            <dd><code>{info.branch ?? 'unknown'}</code></dd>

            <dt>services ({info.services?.length ?? 0})</dt>
            <dd class="services">
                {#each info.services ?? [] as s}
                    <span class="service">{s}</span>
                {/each}
            </dd>
        </dl>
    {:else if infoError}
        <p class="error">could not reach the snag api: <code>{infoError}</code></p>
    {:else}
        <p class="loading">loading instance info…</p>
    {/if}

    <h2>links</h2>

    <ul>
        <li><a href="/about/license">license</a></li>
        <li><a href="/about/privacy">privacy</a></li>
        <li><a href="https://github.com/imputnet/cobalt">cobalt (upstream)</a></li>
    </ul>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.03em;
    }

    h2 {
        margin: 1rem 0 0.5rem 0;
        font-size: 1rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
    }

    p {
        margin: 0;
    }

    .info {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.5rem 1rem;
        padding: 1rem 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
    }

    .info dt {
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    .info dd {
        margin: 0;
        font-size: 0.9rem;
    }

    .info dd.services {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    .service {
        padding: 0.15rem 0.5rem;
        background: var(--surface-elevated);
        border: 1px solid var(--border);
        border-radius: 0.4em;
        font-size: 0.8rem;
        font-family: var(--font-mono);
    }

    code {
        font-size: 0.9em;
        padding: 0.05em 0.3em;
        background: var(--surface-elevated);
        border-radius: 0.25em;
    }

    .loading,
    .error {
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    ul {
        margin: 0;
        padding-left: 1.25rem;
    }
</style>
