<div class="page">
    <header class="page-head">
        <p class="crumb tracked"><a href="/about">about</a> &middot; license</p>
        <h1 class="title">License.</h1>
        <p class="lede">
            unless a subdirectory says otherwise, snag is licensed under the
            <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</a>.
        </p>
    </header>

    <section class="group">
        <h2 class="group-head tracked">what AGPL-3.0 means</h2>
        <ul class="bullets">
            <li>you can use, study, modify, and redistribute snag freely.</li>
            <li>
                if you modify snag and run it as a service for others, you must publish your
                modifications under the same license.
            </li>
            <li>derivative works stay AGPL-3.0.</li>
        </ul>
    </section>

    <section class="group">
        <h2 class="group-head tracked">module licenses</h2>
        <div class="row">
            <span class="row-label mono">api/</span>
            <span class="row-value mono">AGPL-3.0 — inherited from cobalt</span>
        </div>
        <div class="row">
            <span class="row-label mono">web/</span>
            <span class="row-value mono">AGPL-3.0 — independent snag implementation</span>
        </div>
        <div class="row">
            <span class="row-label mono">cli/</span>
            <span class="row-value mono">AGPL-3.0 — snag-authored go binary</span>
        </div>
        <div class="row">
            <span class="row-label mono">packages/version-info/</span>
            <span class="row-value mono">AGPL-3.0 — git metadata helper</span>
        </div>
    </section>

    <section class="group">
        <h2 class="group-head tracked">credit</h2>
        <p class="prose">
            snag is a fork of
            <a href="https://github.com/imputnet/cobalt">cobalt by imput</a>. the cobalt api
            server, shared packages, and architectural patterns are inherited under AGPL-3.0.
        </p>
        <p class="prose">
            cobalt&rsquo;s web frontend is licensed under CC-BY-NC-SA 4.0 and is
            <span class="italic">not</span> redistributed in this repository — the snag web
            frontend is an independent reimplementation under AGPL-3.0.
        </p>
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

    .crumb {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.78rem;
    }

    .crumb a {
        color: var(--text-muted);
        border-bottom: 1px solid transparent;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .crumb a:hover {
        color: var(--text);
        border-bottom-color: var(--text);
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

    .lede a {
        color: var(--text);
        border-bottom: 1px solid var(--line-strong);
        padding-bottom: 0.05rem;
    }

    .lede a:hover {
        border-bottom-color: var(--accent);
        color: var(--accent);
    }

    .group {
        display: flex;
        flex-direction: column;
        max-width: 42rem;
        gap: 0.75rem;
    }

    .group-head {
        margin: 0 0 0.5rem;
        color: var(--text-muted);
        font-size: 0.78rem;
        padding-bottom: 0.65rem;
        border-bottom: 1px solid var(--line-strong);
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
        line-height: 1.55;
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

    .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1.5rem;
        padding: 0.7rem 0;
        border-bottom: 1px solid var(--line);
    }

    .row-label {
        color: var(--text);
        font-size: 0.85rem;
    }

    .row-value {
        color: var(--text-soft);
        font-size: 0.78rem;
        text-align: right;
    }

    .prose {
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

    .italic {
        font-style: italic;
        color: var(--text);
    }
</style>
