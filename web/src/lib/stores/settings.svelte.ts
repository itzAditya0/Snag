import { browser } from '$app/environment';
import type {
    AudioBitrate,
    AudioFormat,
    DownloadMode,
    FilenameStyle,
    LocalProcessing,
    SnagRequest,
    VideoCodec,
    VideoContainer,
    VideoQuality
} from '$types/api';

// flat settings object — mirrors the api request schema 1:1.
// any field set to its default value is omitted from outgoing requests
// to keep payloads minimal.
export interface Settings {
    videoQuality: VideoQuality;
    audioFormat: AudioFormat;
    audioBitrate: AudioBitrate;
    downloadMode: DownloadMode;
    filenameStyle: FilenameStyle;
    youtubeVideoCodec: VideoCodec;
    youtubeVideoContainer: VideoContainer;
    localProcessing: LocalProcessing;
    youtubeDubLang: string;
    subtitleLang: string;
    disableMetadata: boolean;
    allowH265: boolean;
    convertGif: boolean;
    alwaysProxy: boolean;
    youtubeHLS: boolean;
    youtubeBetterAudio: boolean;

    // F2 Basic — output format conversion defaults.
    videoCodec: 'auto' | 'h264' | 'h265' | 'av1' | 'vp9';
    videoContainer: 'auto' | 'mp4' | 'mkv' | 'webm';
    targetHeight: 'source' | '2160' | '1440' | '1080' | '720' | '480' | '360';
    burnSubtitles: boolean;

    // F2 Polish — output format switch + LUFS. thumbnailAt is per-
    // download (set on the home page advanced disclosure) so it's not
    // persisted here.
    outputFormat: 'video' | 'gif' | 'webp' | 'audio';
    normalizeAudio: 'off' | 'ebu' | 'broadcast';
}

export const defaults: Settings = {
    videoQuality: '1080',
    audioFormat: 'mp3',
    audioBitrate: '128',
    downloadMode: 'auto',
    filenameStyle: 'basic',
    youtubeVideoCodec: 'h264',
    youtubeVideoContainer: 'auto',
    localProcessing: 'disabled',
    youtubeDubLang: '',
    subtitleLang: '',
    disableMetadata: false,
    allowH265: false,
    convertGif: true,
    // tunnel by default: many CDNs (twitter/twimg, instagram, some imgur)
    // gate hotlinking by referer/origin or get blocked by privacy-focused
    // browsers. tunneling routes the file through the local snag api
    // process — costs a few MB of self-hosted bandwidth in exchange for
    // reliability across every browser and network. flip to false in
    // settings if you'd rather save bandwidth and accept the occasional
    // "access denied" on direct-redirect CDNs.
    alwaysProxy: true,
    youtubeHLS: false,
    youtubeBetterAudio: false,
    videoCodec: 'auto',
    videoContainer: 'auto',
    targetHeight: 'source',
    burnSubtitles: false,
    outputFormat: 'video',
    normalizeAudio: 'off'
};

const STORAGE_KEY = 'snag.settings.v1';

// settings schema migrations. each entry runs once when the saved
// schemaVersion is below the index. the user's current version is
// stored under SCHEMA_VERSION_KEY so we can do non-destructive
// upgrades (e.g. flipping a default that we believe stale users
// are stuck with) without nuking their other preferences.
//
// we do NOT bump STORAGE_KEY for this — that would reset every
// preference, which is too aggressive when the actual change is
// a single field's default flipping.
const SCHEMA_VERSION_KEY = 'snag.settings.schemaVersion';
const CURRENT_SCHEMA_VERSION = 2;

const migrations: Array<(s: Record<string, unknown>) => void> = [
    // v1 → v2: alwaysProxy default flipped false → true. for users
    // whose stored value matches the OLD default exactly (false), the
    // most likely explanation is "they never touched the setting and
    // are running the old default" — so we adopt the new default. if
    // someone explicitly set it to false and we mis-migrate, they can
    // toggle it back in /settings; that's a strictly better state than
    // having "always tunnel" be silently off and downloads silently
    // failing on cross-origin CDN blocks.
    (s) => {
        if (s.alwaysProxy === false) {
            delete s.alwaysProxy;
        }
    }
];

function load(): Settings {
    if (!browser) return { ...defaults };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
            return { ...defaults };
        }
        const parsed = JSON.parse(raw);

        // run pending migrations on the parsed object before merge.
        const savedVersion = parseInt(
            localStorage.getItem(SCHEMA_VERSION_KEY) ?? '1',
            10
        );
        for (let v = savedVersion; v < CURRENT_SCHEMA_VERSION; v++) {
            migrations[v - 1]?.(parsed);
        }
        if (savedVersion < CURRENT_SCHEMA_VERSION) {
            localStorage.setItem(
                SCHEMA_VERSION_KEY,
                String(CURRENT_SCHEMA_VERSION)
            );
        }

        // merge so newly-added keys get their defaults
        return { ...defaults, ...parsed };
    } catch {
        return { ...defaults };
    }
}

function save(s: Settings) {
    if (!browser) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
        /* quota / disabled / private mode — silently ignore */
    }
}

// reactive, app-wide settings state
export const settings = $state<Settings>(load());

// install a save-on-change effect. call this once from the root layout's
// <script> so the effect lives for the whole session.
export function installPersistence() {
    $effect(() => {
        // tracks every field by reading them
        const snapshot: Settings = {
            videoQuality: settings.videoQuality,
            audioFormat: settings.audioFormat,
            audioBitrate: settings.audioBitrate,
            downloadMode: settings.downloadMode,
            filenameStyle: settings.filenameStyle,
            youtubeVideoCodec: settings.youtubeVideoCodec,
            youtubeVideoContainer: settings.youtubeVideoContainer,
            localProcessing: settings.localProcessing,
            youtubeDubLang: settings.youtubeDubLang,
            subtitleLang: settings.subtitleLang,
            disableMetadata: settings.disableMetadata,
            allowH265: settings.allowH265,
            convertGif: settings.convertGif,
            alwaysProxy: settings.alwaysProxy,
            youtubeHLS: settings.youtubeHLS,
            youtubeBetterAudio: settings.youtubeBetterAudio,
            videoCodec: settings.videoCodec,
            videoContainer: settings.videoContainer,
            targetHeight: settings.targetHeight,
            burnSubtitles: settings.burnSubtitles,
            outputFormat: settings.outputFormat,
            normalizeAudio: settings.normalizeAudio
        };
        save(snapshot);
    });
}

export function resetSettings() {
    Object.assign(settings, defaults);
}

// build a SnagRequest payload from the current settings + the URL.
// only includes fields that differ from defaults to keep the wire small.
export function buildRequest(url: string): SnagRequest {
    const req: Record<string, unknown> = { url };
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
        if (key === 'youtubeDubLang' || key === 'subtitleLang') {
            const v = settings[key];
            if (typeof v === 'string' && v.trim().length > 0) {
                req[key] = v.trim();
            }
            continue;
        }
        if (settings[key] !== defaults[key]) {
            req[key] = settings[key];
        }
    }
    return req as unknown as SnagRequest;
}
