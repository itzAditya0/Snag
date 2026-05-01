import createFilename from "./create-filename.js";

import { createResponse } from "./request.js";
import { audioIgnore } from "./service-config.js";
import { createStream } from "../stream/manage.js";
import { splitFilenameExtension } from "../misc/utils.js";
import { convertLanguageCode } from "../misc/language-codes.js";

const extraProcessingTypes = new Set(["merge", "remux", "mute", "audio", "gif"]);

export default function({
    r,
    host,
    audioFormat,
    isAudioOnly,
    isAudioMuted,
    disableMetadata,
    filenameStyle,
    convertGif,
    requestIP,
    audioBitrate,
    alwaysProxy,
    localProcessing,
    trimStart,
    trimEnd,
    videoCodec,
    videoContainer,
    targetHeight,
    burnSubtitles,
    outputFormat,
    normalizeAudio,
    thumbnailAt,
}) {
    let action,
        responseType = "tunnel",
        defaultParams = {
            url: r.urls,
            headers: r.headers,
            service: host,
            filename: r.filenameAttributes ?
                    createFilename(r.filenameAttributes, filenameStyle, isAudioOnly, isAudioMuted) : r.filename,
            fileMetadata: !disableMetadata ? r.fileMetadata : false,
            requestIP,
            originalRequest: r.originalRequest,
            subtitles: r.subtitles,
            cover: !disableMetadata ? r.cover : false,
            cropCover: !disableMetadata ? r.cropCover : false,
        },
        params = {};

    if (r.isPhoto) action = "photo";
    else if (r.picker) action = "picker"
    else if (r.isGif && convertGif) action = "gif";
    else if (isAudioOnly) action = "audio";
    else if (isAudioMuted) action = "muteVideo";
    else if (r.isHLS) action = "hls";
    else action = "video";

    // F2 Polish — outputFormat / thumbnailAt rewrite the action so the
    // pipeline switches to the right ffmpeg flow. thumbnailAt wins over
    // outputFormat. doesn't apply to picker / photo content.
    if (action !== "photo" && action !== "picker") {
        if (thumbnailAt) {
            action = "thumbnail";
        } else if (outputFormat === "audio") {
            action = "audio";
        } else if (outputFormat === "gif") {
            action = "gif";
        } else if (outputFormat === "webp") {
            action = "webp";
        }
    }

    if (action === "picker" || action === "audio") {
        if (!r.filenameAttributes) defaultParams.filename = r.audioFilename;
        defaultParams.audioFormat = audioFormat;
    }

    if (action === "muteVideo" && isAudioMuted && !r.filenameAttributes) {
        const [ name, ext ] = splitFilenameExtension(r.filename);
        defaultParams.filename = `${name}_mute.${ext}`;
    } else if (action === "gif") {
        // defaultParams.filename was already resolved from filenameAttributes
        // or r.filename above — use it so YouTube etc. (where r.filename
        // alone is undefined) doesn't crash splitFilenameExtension.
        const [ name ] = splitFilenameExtension(defaultParams.filename || "media");
        defaultParams.filename = `${name}.gif`;
    } else if (action === "webp") {
        const [ name ] = splitFilenameExtension(defaultParams.filename || "media");
        defaultParams.filename = `${name}.webp`;
    } else if (action === "thumbnail") {
        const [ name ] = splitFilenameExtension(defaultParams.filename || "media");
        defaultParams.filename = `${name}.jpg`;
    }

    switch (action) {
        default:
            return createResponse("error", {
                code: "error.api.fetch.empty"
            });

        case "photo":
            params = { type: "proxy" };
            break;

        case "gif":
            params = { type: "gif" };
            break;

        case "webp":
            params = { type: "webp" };
            responseType = "tunnel";
            break;

        case "thumbnail":
            params = { type: "thumbnail" };
            responseType = "tunnel";
            break;

        case "hls":
            params = {
                type: Array.isArray(r.urls) ? "merge" : "remux",
                isHLS: true,
            }
            break;

        case "muteVideo":
            let muteType = "mute";
            if (Array.isArray(r.urls) && !r.isHLS) {
                muteType = "proxy";
            }
            params = {
                type: muteType,
                url: Array.isArray(r.urls) ? r.urls[0] : r.urls,
                isHLS: r.isHLS
            }
            if (host === "reddit" && r.typeId === "redirect") {
                responseType = "redirect";
            }
            break;

        case "picker":
            responseType = "picker";
            switch (host) {
                case "instagram":
                case "twitter":
                case "bsky":
                case "imgur":
                    params = { picker: r.picker };
                    break;
            }
            break;

        case "video":
            switch (host) {
                case "bilibili":
                    params = { type: "merge" };
                    break;

                case "youtube":
                    params = { type: r.type };
                    break;

                case "reddit":
                    responseType = r.typeId;
                    params = { type: r.type };
                    break;

                case "rutube":
                    if (Array.isArray(r.urls)) {
                        params = { type: "merge" };
                    } else if (r.subtitles) {
                        params = { type: "remux" };
                    } else {
                        responseType = "redirect";
                    }
                    break;

                case "twitter":
                    if (r.type === "remux") {
                        params = { type: r.type };
                    } else {
                        responseType = "redirect";
                    }
                    break;

                case "loom":
                    if (r.subtitles) {
                        params = { type: "remux" };
                    } else {
                        responseType = "redirect";
                    }
                    break;

                case "vk":
                    params = {
                        type: r.subtitles ? "remux" : "proxy"
                    };
                    break;

                case "ok":
                case "newgrounds":
                    params = { type: "proxy" };
                    break;

                case "imgur":
                case "instagram":
                case "tumblr":
                case "pinterest":
                case "streamable":
                case "twitch":
                    responseType = "redirect";
                    break;
            }
            break;

        case "audio":
            if (audioIgnore.has(host) || (host === "reddit" && r.typeId === "redirect")) {
                return createResponse("error", {
                    code: "error.api.service.audio_not_supported"
                })
            }

            let processType = "audio";
            let copy = false;

            if (audioFormat === "best") {
                const serviceBestAudio = r.bestAudio;

                if (serviceBestAudio) {
                    audioFormat = serviceBestAudio;
                    processType = "proxy";

                    if (host === "soundcloud") {
                        processType = "audio";
                        copy = true;
                    }
                } else {
                    audioFormat = "m4a";
                    copy = true;
                }
            }

            if (r.isHLS) {
                copy = false;
                processType = "audio";
            }

            params = {
                type: processType,
                url: Array.isArray(r.urls) ? r.urls[1] : r.urls,

                audioBitrate,
                audioCopy: copy,
                audioFormat,

                isHLS: r.isHLS,
            }
            break;
    }

    if (defaultParams.filename && (action === "picker" || action === "audio")) {
        defaultParams.filename += `.${audioFormat}`;
    }

    // alwaysProxy is set to true in match.js if localProcessing is forced
    if (alwaysProxy && responseType === "redirect") {
        responseType = "tunnel";
        params.type = "proxy";
    }

    // TODO: add support for HLS
    // (very painful)
    if (!params.isHLS && responseType !== "picker") {
        const isPreferredWithExtra =
            localProcessing === "preferred" && extraProcessingTypes.has(params.type);

        if (localProcessing === "forced" || isPreferredWithExtra) {
            responseType = "local-processing";
        }
    }

    // F3 — trim. when trimStart/trimEnd is set, force the response through
    // FFmpeg so the cut is actually applied. photos/pickers can't be trimmed.
    if ((trimStart || trimEnd) && action !== "photo" && action !== "picker") {
        if (responseType === "redirect" || (responseType === "tunnel" && params.type === "proxy")) {
            params.type = action === "audio" ? "audio" : "remux";
            responseType = "tunnel";
        }
        if (responseType === "tunnel" || responseType === "local-processing") {
            params.trimStart = trimStart;
            params.trimEnd = trimEnd;
        }
    }

    // F2 Basic — format conversion. any non-default forces FFmpeg.
    const wantsConversion =
        (videoCodec && videoCodec !== "auto") ||
        (videoContainer && videoContainer !== "auto") ||
        (targetHeight && targetHeight !== "source") ||
        burnSubtitles;
    if (wantsConversion && action !== "photo" && action !== "picker" && action !== "audio" && action !== "gif" && action !== "webp" && action !== "thumbnail") {
        if (responseType === "redirect" || (responseType === "tunnel" && params.type === "proxy")) {
            params.type = "remux";
            responseType = "tunnel";
        }
        if (responseType === "tunnel" || responseType === "local-processing") {
            params.videoCodec = videoCodec;
            params.videoContainer = videoContainer;
            params.targetHeight = targetHeight;
            params.burnSubtitles = burnSubtitles;
            // override the filename extension when container changes
            if (videoContainer && videoContainer !== "auto") {
                const fn = defaultParams.filename;
                if (typeof fn === "string") {
                    const dot = fn.lastIndexOf(".");
                    defaultParams.filename =
                        (dot > 0 ? fn.slice(0, dot) : fn) + "." + videoContainer;
                }
            }
        }
    }

    // F2 Polish — outputFormat / thumbnailAt / normalizeAudio also force
    // tunnel and need their own params threaded into streamInfo. action
    // overrides above already routed dispatch; this sets the FFmpeg knobs.
    const wantsPolish =
        thumbnailAt ||
        (outputFormat && outputFormat !== "video") ||
        (normalizeAudio && normalizeAudio !== "off");
    if (wantsPolish && action !== "photo" && action !== "picker") {
        if (responseType === "redirect") {
            responseType = "tunnel";
            // thumbnail / webp / gif / audio dispatch types are already
            // set by the action switch above; only fall back to remux
            // when nothing more specific applies.
            if (!params.type) params.type = "remux";
        }
        if (responseType === "tunnel" || responseType === "local-processing") {
            params.thumbnailAt = thumbnailAt;
            params.outputFormat = outputFormat;
            params.normalizeAudio = normalizeAudio;
        }
    }

    // extractors usually return ISO 639-1 language codes,
    // but video players expect ISO 639-2, so we convert them here
    const sublanguage = defaultParams.fileMetadata?.sublanguage;
    if (sublanguage && sublanguage.length !== 3) {
        const code = convertLanguageCode(sublanguage);
        if (code) {
            defaultParams.fileMetadata.sublanguage = code;
        } else {
            // if a language code couldn't be converted,
            // then we don't want it at all
            delete defaultParams.fileMetadata.sublanguage;
        }
    }

    return createResponse(
        responseType,
        { ...defaultParams, ...params }
    );
}
