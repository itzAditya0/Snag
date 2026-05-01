<div class="page">
    <h1>privacy</h1>

    <p>
        snag is built so that running it for someone else does not require trusting them. the
        same principles apply to any instance you run yourself.
    </p>

    <h2>what the snag api processes</h2>

    <ul>
        <li>
            URLs you submit are passed to the relevant platform (YouTube, SoundCloud, etc.) so the
            file you want can be located. these requests come from the instance's IP, not yours.
        </li>
        <li>
            file content is streamed through the instance live and discarded immediately. nothing
            is written to disk.
        </li>
        <li>
            tunnel URLs (the temporary download links) are HMAC-signed with a per-instance secret
            and expire after a few minutes. they are bound to the issuing IP by default.
        </li>
    </ul>

    <h2>what the snag api does not store</h2>

    <ul>
        <li>no accounts, sessions, or cookies for users.</li>
        <li>no log of which URLs were requested or by whom.</li>
        <li>no copy of downloaded media files.</li>
        <li>no analytics, no third-party trackers, no fingerprinting.</li>
    </ul>

    <h2>what your browser stores</h2>

    <ul>
        <li>
            your snag settings (codec, quality, format, etc.) are saved in your browser's
            <code>localStorage</code> under the key <code>snag.settings.v1</code>. this never
            leaves your device.
        </li>
        <li>
            no cookies are set by the snag web frontend itself.
        </li>
    </ul>

    <h2>what your network sees</h2>

    <ul>
        <li>
            with default settings, your browser fetches the file directly from the source CDN —
            your network can see which platform you downloaded from.
        </li>
        <li>
            with the <em>always proxy</em> setting on, every byte goes through the snag instance
            instead — your network only sees traffic to the instance.
        </li>
    </ul>

    <p>
        <a href="/about">&larr; back to about</a>
    </p>
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

    p,
    ul {
        margin: 0;
    }

    ul {
        padding-left: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    code {
        font-size: 0.9em;
        padding: 0.05em 0.3em;
        background: var(--surface-elevated);
        border-radius: 0.25em;
        font-family: var(--font-mono);
    }
</style>
