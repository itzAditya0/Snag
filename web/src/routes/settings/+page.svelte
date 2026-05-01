<script lang="ts">
    import { settings, defaults, resetSettings } from '$stores/settings.svelte';

    function isDefault<K extends keyof typeof settings>(key: K): boolean {
        return settings[key] === defaults[key];
    }

    function changedCount() {
        let n = 0;
        for (const k of Object.keys(defaults) as (keyof typeof defaults)[]) {
            if (settings[k] !== defaults[k]) n++;
        }
        return n;
    }
</script>

<div class="page">
    <div class="header-row">
        <h1>settings</h1>
        {#if changedCount() > 0}
            <button class="reset" onclick={resetSettings}>
                reset to defaults ({changedCount()} changed)
            </button>
        {/if}
    </div>

    <p class="hint">
        settings are saved to your browser's local storage and applied to every download. defaults are
        chosen to match what most people want.
    </p>

    <section>
        <h2>video</h2>

        <label class="row">
            <span class="label">quality</span>
            <select bind:value={settings.videoQuality}>
                <option value="max">max available</option>
                <option value="4320">8K (4320p)</option>
                <option value="2160">4K (2160p)</option>
                <option value="1440">1440p</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="360">360p</option>
                <option value="240">240p</option>
                <option value="144">144p</option>
            </select>
        </label>

        <label class="row">
            <span class="label">YouTube codec</span>
            <select bind:value={settings.youtubeVideoCodec}>
                <option value="h264">H.264 (most compatible)</option>
                <option value="av1">AV1 (smaller, newer)</option>
                <option value="vp9">VP9</option>
            </select>
        </label>

        <label class="row">
            <span class="label">YouTube container</span>
            <select bind:value={settings.youtubeVideoContainer}>
                <option value="auto">auto</option>
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
                <option value="mkv">MKV</option>
            </select>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.allowH265} />
            <span>allow H.265 (HEVC) for compatible services</span>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.youtubeHLS} />
            <span>prefer HLS for YouTube</span>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.convertGif} />
            <span>convert GIFs to MP4 (faster, smaller)</span>
        </label>
    </section>

    <section>
        <h2>audio</h2>

        <label class="row">
            <span class="label">format</span>
            <select bind:value={settings.audioFormat}>
                <option value="best">best (no re-encode)</option>
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
                <option value="ogg">OGG</option>
                <option value="wav">WAV</option>
            </select>
        </label>

        <label class="row">
            <span class="label">bitrate (kbps)</span>
            <select bind:value={settings.audioBitrate}>
                <option value="320">320</option>
                <option value="256">256</option>
                <option value="128">128</option>
                <option value="96">96</option>
                <option value="64">64</option>
                <option value="8">8 (voice memo)</option>
            </select>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.youtubeBetterAudio} />
            <span>prefer YouTube's higher-quality audio stream</span>
        </label>
    </section>

    <section>
        <h2>files</h2>

        <label class="row">
            <span class="label">filename style</span>
            <select bind:value={settings.filenameStyle}>
                <option value="classic">classic</option>
                <option value="pretty">pretty</option>
                <option value="basic">basic</option>
                <option value="nerdy">nerdy</option>
            </select>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.disableMetadata} />
            <span>strip metadata from downloaded files</span>
        </label>
    </section>

    <section>
        <h2>subtitles &amp; dubs</h2>

        <label class="row">
            <span class="label">subtitle language</span>
            <input
                type="text"
                placeholder="e.g. en, es, ja (ISO-639-1)"
                bind:value={settings.subtitleLang}
                maxlength="8"
            />
        </label>

        <label class="row">
            <span class="label">YouTube dub language</span>
            <input
                type="text"
                placeholder="e.g. en, es, ja (ISO-639-1)"
                bind:value={settings.youtubeDubLang}
                maxlength="8"
            />
        </label>
    </section>

    <section>
        <h2>processing &amp; privacy</h2>

        <label class="row">
            <span class="label">local (in-browser) processing</span>
            <select bind:value={settings.localProcessing}>
                <option value="disabled">disabled</option>
                <option value="preferred">preferred when available</option>
                <option value="forced">forced (fail if unavailable)</option>
            </select>
        </label>

        <label class="row check">
            <input type="checkbox" bind:checked={settings.alwaysProxy} />
            <span>always proxy downloads through the snag instance</span>
        </label>

        <p class="hint sub">
            local processing keeps the file on your device — the server never holds the merged result.
            requires sufficient memory for FFmpeg-WASM.
        </p>
    </section>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
    }

    h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.03em;
    }

    h2 {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
    }

    .hint {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .hint.sub {
        margin-top: 0.5rem;
        font-size: 0.8rem;
    }

    .reset {
        padding: 0.4rem 0.75rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    .reset:hover {
        color: var(--accent);
        border-color: var(--accent);
    }

    section {
        padding: 1rem 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .row .label {
        flex: 1;
        font-size: 0.95rem;
    }

    .row select,
    .row input[type='text'] {
        flex: 1;
        max-width: 18rem;
        padding: 0.45rem 0.6rem;
        background: var(--surface-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 0.9rem;
    }

    .row select:focus,
    .row input[type='text']:focus {
        outline: none;
        border-color: var(--accent);
    }

    .row.check {
        cursor: pointer;
    }

    .row.check input[type='checkbox'] {
        accent-color: var(--accent);
        width: 1rem;
        height: 1rem;
    }
</style>
