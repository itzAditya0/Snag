<div class="page">
    <header class="page-head">
        <p class="crumb tracked"><a href="/about">about</a> &middot; privacy</p>
        <h1 class="title">Privacy.</h1>
        <p class="lede">
            snag is built so running it for someone else doesn&rsquo;t require trusting them. the
            same applies to any instance you run yourself.
        </p>
    </header>

    <section class="group">
        <h2 class="group-head tracked">what the api processes</h2>
        <ul class="bullets">
            <li>
                URLs you submit are passed to the relevant platform so the file you want can be
                located. these requests come from the instance&rsquo;s IP, not yours.
            </li>
            <li>
                file content is streamed through the instance live and discarded immediately.
                nothing is written to disk.
            </li>
            <li>
                tunnel URLs (the temporary download links) are HMAC-signed with a per-instance
                secret and expire after a few minutes. they are bound to the issuing IP by default.
            </li>
        </ul>
    </section>

    <section class="group">
        <h2 class="group-head tracked">what the api does <span class="italic">not</span> store</h2>
        <ul class="bullets">
            <li>no accounts, sessions, or cookies for users.</li>
            <li>no log of which URLs were requested or by whom.</li>
            <li>no copy of downloaded media files.</li>
            <li>no analytics, no third-party trackers, no fingerprinting.</li>
        </ul>
    </section>

    <section class="group">
        <h2 class="group-head tracked">what your browser stores</h2>
        <ul class="bullets">
            <li>
                your snag settings (codec, quality, format, etc.) are saved to
                <code>localStorage</code> under <code>snag.settings.v1</code>. this never leaves
                your device.
            </li>
            <li>no cookies are set by the snag web frontend itself.</li>
        </ul>
    </section>

    <section class="group">
        <h2 class="group-head tracked">what your network sees</h2>
        <ul class="bullets">
            <li>
                with default settings, your browser fetches the file directly from the source CDN
                — your network can see which platform you downloaded from.
            </li>
            <li>
                with <span class="italic">always proxy</span> on, every byte goes through the snag
                instance instead — your network only sees traffic to the instance.
            </li>
        </ul>
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

    .group-head .italic {
        color: var(--text);
    }

    .bullets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
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

    code {
        font-size: 0.85em;
        padding: 0.05em 0.3em;
        background: var(--surface);
        border-radius: 0.2em;
        color: var(--text);
    }

    .italic {
        font-style: italic;
    }
</style>
