<script lang="ts">
    import '../app.css';
    import { page } from '$app/state';
    import { installPersistence } from '$stores/settings.svelte';
    import { installQueuePersistence } from '$stores/queue.svelte';
    import EntryScreen from '$components/loading/EntryScreen.svelte';

    let { children } = $props();

    installPersistence();
    installQueuePersistence();

    const navItems = [
        { label: 'INDEX', href: '/' },
        { label: 'HISTORY', href: '/history' },
        { label: 'ABOUT', href: '/about' }
    ];

    function isActive(href: string): boolean {
        if (href === '/') return page.url.pathname === '/';
        return page.url.pathname.startsWith(href);
    }
</script>

<EntryScreen />

<div class="app">
    <header class="head">
        <a class="brand" href="/">snag.</a>
        <nav class="nav" aria-label="primary">
            {#each navItems as item, i}
                <a class="nav-item" class:active={isActive(item.href)} href={item.href}>
                    {item.label}
                </a>
                {#if i < navItems.length - 1}
                    <span class="dot" aria-hidden="true">·</span>
                {/if}
            {/each}
        </nav>
    </header>

    <main class="main">
        {@render children()}
    </main>

    <footer class="foot">
        <div class="foot-line" aria-hidden="true"></div>
        <div class="foot-row">
            <div class="services mono">
                <span>youtube</span><span class="sep">·</span>
                <span>soundcloud</span><span class="sep">·</span>
                <span>instagram</span><span class="sep">·</span>
                <span>twitter</span><span class="sep">·</span>
                <span>reddit</span><span class="sep">·</span>
                <span>twitch</span><span class="sep">·</span>
                <span class="more">…</span>
            </div>
            <a class="help" href="/about" aria-label="about and help">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" stroke-linecap="round" />
                    <line x1="12" y1="17" x2="12" y2="17" stroke-linecap="round" />
                </svg>
            </a>
        </div>
    </footer>
</div>

<style>
    .app {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 0 var(--gutter);
    }

    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2rem 0 1.5rem;
    }

    .brand {
        font-family: var(--font-sans);
        font-size: 1.4rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--text);
    }

    .nav {
        display: flex;
        align-items: baseline;
        gap: 0.7rem;
    }

    .nav-item {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-muted);
        padding-bottom: 0.15rem;
        border-bottom: 1px solid transparent;
        transition: color 0.18s var(--ease), border-color 0.18s var(--ease);
    }

    .nav-item:hover {
        color: var(--text);
        border-bottom-color: var(--text);
    }

    .nav-item.active {
        color: var(--text);
        border-bottom-color: var(--text);
    }

    .dot {
        color: var(--text-faint);
        font-size: 0.8rem;
        line-height: 1;
        user-select: none;
    }

    .main {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 0;
        padding: 2rem 0;
    }

    .foot {
        margin-top: auto;
    }

    .foot-line {
        height: 1px;
        background: var(--line);
        width: 100%;
    }

    .foot-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 0;
        gap: 1rem;
    }

    .services {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
        color: var(--text-muted);
        font-size: 0.78rem;
        letter-spacing: 0.04em;
    }

    .services .sep {
        color: var(--text-faint);
    }

    .services .more {
        color: var(--text-muted);
    }

    .help {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: 1px solid var(--line-strong);
        border-radius: 50%;
        color: var(--text-muted);
        transition: color 0.18s var(--ease), border-color 0.18s var(--ease);
        flex-shrink: 0;
    }

    .help:hover {
        color: var(--text);
        border-color: var(--text);
    }

    @media (max-width: 720px) {
        .app {
            padding: 0 var(--gutter-sm);
        }

        .head {
            padding: 1.25rem 0 1rem;
        }

        .nav {
            gap: 0.45rem;
        }

        .nav-item {
            font-size: 0.7rem;
        }

        .foot-row {
            flex-direction: column;
            align-items: flex-start;
        }
    }
</style>
