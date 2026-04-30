<script lang="ts">
    import '../app.css';
    import { projectName, projectTagline } from '$lib/env';

    let { children } = $props();
</script>

<div class="app">
    <header class="header">
        <a class="brand" href="/">
            <span class="brand-name">{projectName}</span>
            <span class="brand-tagline">{projectTagline}</span>
        </a>
        <nav class="nav">
            <a href="/settings">settings</a>
            <a href="/about">about</a>
        </nav>
    </header>
    <main class="main">
        {@render children()}
    </main>
    <footer class="footer">
        <span>snag is a fork of <a href="https://github.com/imputnet/cobalt">cobalt</a> by imput.</span>
        <span><a href="/about/license">license</a> &middot; <a href="/about/privacy">privacy</a></span>
    </footer>
</div>

<style>
    .app {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 1.5rem;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 1.5rem 0;
        border-bottom: 1px solid var(--border);
    }

    .brand {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: inherit;
    }

    .brand-name {
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text);
    }

    .brand-tagline {
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .nav {
        display: flex;
        gap: 1rem;
    }

    .nav a {
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.95rem;
    }

    .nav a:hover {
        color: var(--accent);
    }

    .main {
        flex: 1;
        padding: 2rem 0;
    }

    .footer {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 1.5rem 0;
        border-top: 1px solid var(--border);
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    @media (max-width: 600px) {
        .header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
        }
    }
</style>
