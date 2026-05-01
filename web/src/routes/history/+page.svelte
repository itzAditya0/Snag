<div class="page">
    <div class="head-row">
        <h1 class="title">History</h1>
        <span class="badge mono">soon</span>
    </div>

    <p class="lede">
        a queue of in-flight and recent downloads will live here. <span class="italic">resumable,
        searchable, your device only</span> &mdash; never sent to the snag instance.
    </p>

    <ul class="bullets">
        <li>parallel downloads with backoff on rate-limit</li>
        <li>resume after expired tunnel URLs by re-requesting</li>
        <li>persisted in your browser; clearable any time</li>
    </ul>

    <p class="foot mono">
        for now, <a href="/">paste a link on the home page</a>.
    </p>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-width: 38rem;
    }

    .head-row {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
    }

    .title {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3rem);
        font-weight: 500;
        letter-spacing: -0.02em;
        line-height: 1;
        color: var(--text);
    }

    .badge {
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-muted);
        padding: 0.2rem 0.5rem;
        border: 1px solid var(--line-strong);
        border-radius: 0.25em;
    }

    .lede {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.55;
        color: var(--text-soft);
    }

    .italic {
        font-style: italic;
        color: var(--text);
    }

    .bullets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        color: var(--text-soft);
        font-size: 0.95rem;
    }

    .bullets li {
        position: relative;
        padding-left: 1.25rem;
    }

    .bullets li::before {
        content: '·';
        position: absolute;
        left: 0;
        color: var(--text-faint);
    }

    .foot {
        margin: 1rem 0 0;
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    .foot a {
        color: var(--text);
        border-bottom: 1px solid var(--line-strong);
        padding-bottom: 0.05rem;
    }

    .foot a:hover {
        border-bottom-color: var(--accent);
        color: var(--accent);
    }
</style>
