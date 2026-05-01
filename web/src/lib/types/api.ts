// type definitions mirroring snag api's request/response schema.
// kept in sync with api/src/processing/schema.js manually.

export type AudioBitrate = '320' | '256' | '128' | '96' | '64' | '8';
export type AudioFormat = 'best' | 'mp3' | 'ogg' | 'wav' | 'opus';
export type DownloadMode = 'auto' | 'audio' | 'mute';
export type FilenameStyle = 'classic' | 'pretty' | 'basic' | 'nerdy';
export type VideoCodec = 'h264' | 'av1' | 'vp9';
export type VideoContainer = 'auto' | 'mp4' | 'webm' | 'mkv';
export type VideoQuality =
    | 'max'
    | '4320'
    | '2160'
    | '1440'
    | '1080'
    | '720'
    | '480'
    | '360'
    | '240'
    | '144';
export type LocalProcessing = 'disabled' | 'preferred' | 'forced';

export interface SnagRequest {
    url: string;
    audioBitrate?: AudioBitrate;
    audioFormat?: AudioFormat;
    downloadMode?: DownloadMode;
    filenameStyle?: FilenameStyle;
    youtubeVideoCodec?: VideoCodec;
    youtubeVideoContainer?: VideoContainer;
    videoQuality?: VideoQuality;
    localProcessing?: LocalProcessing;
    youtubeDubLang?: string;
    subtitleLang?: string;
    disableMetadata?: boolean;
    allowH265?: boolean;
    convertGif?: boolean;
    alwaysProxy?: boolean;
    youtubeHLS?: boolean;
    youtubeBetterAudio?: boolean;

    // F3 — trim. accepts "ss[.mmm]", "mm:ss[.mmm]", or "hh:mm:ss[.mmm]".
    trimStart?: string;
    trimEnd?: string;

    // F2 Basic — format conversion (output-side, server-side).
    videoCodec?: 'auto' | 'h264' | 'h265' | 'av1' | 'vp9';
    videoContainer?: 'auto' | 'mp4' | 'mkv' | 'webm';
    targetHeight?: 'source' | '2160' | '1440' | '1080' | '720' | '480' | '360';
    burnSubtitles?: boolean;
}

export type ResponseStatus = 'redirect' | 'tunnel' | 'local-processing' | 'picker' | 'error';

export interface PickerItem {
    type: 'photo' | 'video' | 'gif';
    url: string;
    thumb?: string;
}

export interface SnagResponseBase {
    status: ResponseStatus;
}

export interface RedirectResponse extends SnagResponseBase {
    status: 'redirect';
    url: string;
    filename?: string;
}

export interface TunnelResponse extends SnagResponseBase {
    status: 'tunnel';
    url: string;
    filename?: string;
}

export interface LocalProcessingResponse extends SnagResponseBase {
    status: 'local-processing';
    type: string;
    service: string;
    tunnel: string[];
    output?: { type?: string; filename?: string };
}

export interface PickerResponse extends SnagResponseBase {
    status: 'picker';
    audio?: string;
    audioFilename?: string;
    picker: PickerItem[];
}

export interface ErrorResponse extends SnagResponseBase {
    status: 'error';
    error: {
        code: string;
        context?: Record<string, unknown>;
    };
}

export type SnagResponse =
    | RedirectResponse
    | TunnelResponse
    | LocalProcessingResponse
    | PickerResponse
    | ErrorResponse;
