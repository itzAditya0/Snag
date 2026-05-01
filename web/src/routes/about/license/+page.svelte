<div class="page">
    <h1>license</h1>

    <p>
        unless a subdirectory specifies otherwise, snag is licensed under the
        <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</a>.
    </p>

    <h2>what AGPL-3.0 means in practice</h2>

    <ul>
        <li>you can use, study, modify, and redistribute snag freely.</li>
        <li>
            if you modify snag and run it as a network service for others, you must publish your
            modifications under the same license.
        </li>
        <li>derivative works must stay AGPL-3.0.</li>
    </ul>

    <h2>module licenses</h2>

    <dl class="modules">
        <dt><a href="https://github.com/REPLACE_ME/snag/blob/main/api/LICENSE">api/</a></dt>
        <dd>AGPL-3.0 — inherited from cobalt.</dd>

        <dt><a href="https://github.com/REPLACE_ME/snag/blob/main/web/LICENSE">web/</a></dt>
        <dd>AGPL-3.0 — independent snag implementation.</dd>

        <dt>
            <a href="https://github.com/REPLACE_ME/snag/blob/main/packages/api-client/LICENSE">
                packages/api-client/
            </a>
        </dt>
        <dd>MIT — inherited from cobalt.</dd>
    </dl>

    <h2>credit</h2>

    <p>
        snag is a fork of <a href="https://github.com/imputnet/cobalt">cobalt by imput</a>. the
        cobalt api server, shared packages, and architectural patterns are inherited under AGPL-3.0.
        cobalt's web frontend is licensed under CC-BY-NC-SA 4.0 and is <em>not</em> redistributed
        in this repository — the snag web frontend is an independent reimplementation under
        AGPL-3.0.
    </p>

    <p>
        see <a
            href="https://github.com/REPLACE_ME/snag/blob/main/NOTICE"
        >NOTICE</a
        > for full attribution.
    </p>

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
    }

    .modules {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.5rem 1rem;
        padding: 1rem 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin: 0;
    }

    .modules dt {
        font-family: var(--font-mono);
        font-size: 0.9rem;
    }

    .modules dd {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-muted);
    }
</style>
