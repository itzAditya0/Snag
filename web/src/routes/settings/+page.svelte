<script lang="ts">
    import { settings, defaults, resetSettings } from '$stores/settings.svelte';

    function changedCount(): number {
        let n = 0;
        for (const k of Object.keys(defaults) as (keyof typeof defaults)[]) {
            if (settings[k] !== defaults[k]) n++;
        }
        return n;
    }
</script>

<div class="page">
    <header class="page-head">
        <h1 class="title">Settings.</h1>
        <p class="lede">
            saved to your browser. applied to every download. <span class="italic">defaults are
            chosen to match what most people want.</span>
        </p>
        {#if changedCount() > 0}
            <button class="reset tracked" onclick={resetSettings}>
                reset {changedCount()} change{changedCount() === 1 ? '' : 's'}
            </button>
        {/if}
    </header>

    <section class="group">
        <h2 class="group-head tracked">video</h2>

        <div class="row">
            <span class="row-label">quality</span>
            <select class="row-select mono" bind:value={settings.videoQuality}>
                <option value="max">max available</option>
                <option value="4320">8K · 4320p</option>
                <option value="2160">4K · 2160p</option>
                <option value="1440">1440p</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="360">360p</option>
                <option value="240">240p</option>
                <option value="144">144p</option>
            </select>
        </div>

        <div class="row">
            <span class="row-label">youtube codec</span>
            <select class="row-select mono" bind:value={settings.youtubeVideoCodec}>
                <option value="h264">h.264 — most compatible</option>
                <option value="av1">av1 — smaller, newer</option>
                <option value="vp9">vp9</option>
            </select>
        </div>

        <div class="row">
            <span class="row-label">youtube container</span>
            <select class="row-select mono" bind:value={settings.youtubeVideoContainer}>
                <option value="auto">auto</option>
                <option value="mp4">mp4</option>
                <option value="webm">webm</option>
                <option value="mkv">mkv</option>
            </select>
        </div>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.allowH265} />
            <span class="row-label">allow h.265 (hevc) where supported</span>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.youtubeHLS} />
            <span class="row-label">prefer hls for youtube</span>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.convertGif} />
            <span class="row-label">convert gifs to mp4 (smaller, faster)</span>
        </label>
    </section>

    <section class="group">
        <h2 class="group-head tracked">audio</h2>

        <div class="row">
            <span class="row-label">format</span>
            <select class="row-select mono" bind:value={settings.audioFormat}>
                <option value="best">best — no re-encode</option>
                <option value="mp3">mp3</option>
                <option value="opus">opus</option>
                <option value="ogg">ogg</option>
                <option value="wav">wav</option>
            </select>
        </div>

        <div class="row">
            <span class="row-label">bitrate</span>
            <select class="row-select mono" bind:value={settings.audioBitrate}>
                <option value="320">320 kbps</option>
                <option value="256">256 kbps</option>
                <option value="128">128 kbps</option>
                <option value="96">96 kbps</option>
                <option value="64">64 kbps</option>
                <option value="8">8 kbps · voice memo</option>
            </select>
        </div>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.youtubeBetterAudio} />
            <span class="row-label">prefer youtube&rsquo;s higher-quality audio stream</span>
        </label>
    </section>

    <section class="group">
        <h2 class="group-head tracked">files</h2>

        <div class="row">
            <span class="row-label">filename style</span>
            <select class="row-select mono" bind:value={settings.filenameStyle}>
                <option value="classic">classic</option>
                <option value="pretty">pretty</option>
                <option value="basic">basic</option>
                <option value="nerdy">nerdy</option>
            </select>
        </div>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.disableMetadata} />
            <span class="row-label">strip metadata from downloaded files</span>
        </label>
    </section>

    <section class="group">
        <h2 class="group-head tracked">subtitles &amp; dubs</h2>

        <div class="row">
            <span class="row-label">subtitle language</span>
            <input
                class="row-input mono"
                type="text"
                placeholder="en, es, ja…"
                bind:value={settings.subtitleLang}
                maxlength="8"
            />
        </div>

        <div class="row">
            <span class="row-label">youtube dub language</span>
            <input
                class="row-input mono"
                type="text"
                placeholder="en, es, ja…"
                bind:value={settings.youtubeDubLang}
                maxlength="8"
            />
        </div>
    </section>

    <section class="group">
        <h2 class="group-head tracked">processing &amp; privacy</h2>

        <div class="row">
            <span class="row-label">in-browser processing</span>
            <select class="row-select mono" bind:value={settings.localProcessing}>
                <option value="disabled">disabled</option>
                <option value="preferred">preferred when available</option>
                <option value="forced">forced — fail if unavailable</option>
            </select>
        </div>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.alwaysProxy} />
            <span class="row-label">always proxy downloads through the snag instance</span>
        </label>

        <p class="note">
            local processing keeps the file on your device — the server never holds the merged
            result. requires sufficient memory for ffmpeg-wasm.
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
        color: var(--text-muted);
    }

    .reset {
        align-self: flex-start;
        margin-top: 0.5rem;
        color: var(--text-muted);
        padding-bottom: 0.15rem;
        border-bottom: 1px solid var(--line-strong);
        background: none;
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .reset:hover {
        color: var(--text);
        border-bottom-color: var(--text);
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
        align-items: center;
        justify-content: space-between;
        gap: 1.5rem;
        padding: 0.85rem 0;
        border-bottom: 1px solid var(--line);
    }

    .row.check {
        cursor: pointer;
        gap: 0.85rem;
        justify-content: flex-start;
    }

    .row-label {
        color: var(--text);
        font-size: 0.95rem;
        flex: 1;
    }

    .row.check .row-label {
        color: var(--text-soft);
        flex: 1;
    }

    .row-select,
    .row-input {
        background: transparent;
        border: none;
        color: var(--text);
        font-size: 0.9rem;
        text-align: right;
        padding: 0.2rem 0;
        cursor: pointer;
        max-width: 16rem;
        appearance: none;
        -webkit-appearance: none;
    }

    .row-input {
        text-align: right;
        cursor: text;
    }

    .row-input::placeholder {
        color: var(--text-faint);
    }

    .row-select:focus,
    .row-input:focus {
        outline: none;
        color: var(--accent);
    }

    /* native select arrow on the right of the value */
    .row-select {
        background-image:
            linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
            linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
        background-position:
            calc(100% - 12px) calc(50% + 1px),
            calc(100% - 7px) calc(50% + 1px);
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
        padding-right: 1.4rem;
    }

    .row-select:hover {
        background-image:
            linear-gradient(45deg, transparent 50%, var(--text) 50%),
            linear-gradient(135deg, var(--text) 50%, transparent 50%);
    }

    /* style the option list itself (limited but matters) */
    .row-select option {
        background: var(--bg);
        color: var(--text);
    }

    .row.check input[type='checkbox'] {
        appearance: none;
        -webkit-appearance: none;
        width: 1rem;
        height: 1rem;
        border: 1px solid var(--text-muted);
        border-radius: 2px;
        background: transparent;
        cursor: pointer;
        flex-shrink: 0;
        position: relative;
        transition: border-color 0.15s var(--ease);
    }

    .row.check input[type='checkbox']:hover {
        border-color: var(--text);
    }

    .row.check input[type='checkbox']:checked {
        background: var(--accent);
        border-color: var(--accent);
    }

    .row.check input[type='checkbox']:checked::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 5px;
        width: 4px;
        height: 8px;
        border-right: 1.5px solid var(--bg);
        border-bottom: 1.5px solid var(--bg);
        transform: rotate(45deg);
    }

    .note {
        margin: 1rem 0 0;
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1.55;
        max-width: 32rem;
        font-style: italic;
    }

    @media (max-width: 720px) {
        .row {
            gap: 1rem;
        }

        .row-select,
        .row-input {
            max-width: 12rem;
            font-size: 0.85rem;
        }
    }
</style>
