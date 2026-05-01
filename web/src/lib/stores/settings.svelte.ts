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
    alwaysProxy: false,
    youtubeHLS: false,
    youtubeBetterAudio: false,
    videoCodec: 'auto',
    videoContainer: 'auto',
    targetHeight: 'source',
    burnSubtitles: false
};

const STORAGE_KEY = 'snag.settings.v1';

function load(): Settings {
    if (!browser) return { ...defaults };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaults };
        const parsed = JSON.parse(raw);
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
            burnSubtitles: settings.burnSubtitles
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
