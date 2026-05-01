import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import { create as contentDisposition } from "content-disposition-header";

import { env } from "../config.js";
import { destroyInternalStream } from "./manage.js";
import { hlsExceptions } from "../processing/service-config.js";
import { closeResponse, pipe, estimateTunnelLength, estimateAudioMultiplier } from "./shared.js";

const metadataTags = new Set([
    "album",
    "composer",
    "genre",
    "copyright",
    "title",
    "artist",
    "album_artist",
    "track",
    "date",
    "sublanguage"
]);

// parse "ss[.mmm]", "mm:ss[.mmm]", or "hh:mm:ss[.mmm]" into seconds.
// returns NaN for unparseable input.
const trimToSeconds = (t) => {
    if (typeof t !== "string") return NaN;
    if (t.includes(":")) {
        const parts = t.split(":");
        if (parts.length < 2 || parts.length > 3) return NaN;
        return parts.reduce(
            (acc, p, i) => acc + parseFloat(p) * Math.pow(60, parts.length - 1 - i),
            0
        );
    }
    return parseFloat(t);
};

// F3 — trim. compute -t <duration> from {trimStart, trimEnd}, returns null
// if no trim is requested or if the duration is non-positive.
const computeTrimDuration = (streamInfo) => {
    if (!streamInfo.trimEnd) return null;
    const start = streamInfo.trimStart ? trimToSeconds(streamInfo.trimStart) : 0;
    const end = trimToSeconds(streamInfo.trimEnd);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    const dur = end - start;
    return dur > 0 ? dur.toFixed(3) : null;
};

// build inputs with optional fast input-side seek (-ss before -i).
// trim is applied to every input in a multi-input merge so that the merged
// streams stay aligned.
const buildInputs = (urls, streamInfo) => {
    return urls.flatMap((url) => {
        const a = [];
        if (streamInfo.trimStart) a.push("-ss", streamInfo.trimStart);
        a.push("-i", url);
        return a;
    });
};

// F2 Basic — true when any output conversion is requested.
const wantsConversion = (streamInfo) =>
    (streamInfo.videoCodec && streamInfo.videoCodec !== "auto") ||
    (streamInfo.targetHeight && streamInfo.targetHeight !== "source") ||
    streamInfo.burnSubtitles;

const codecMap = {
    h264: "libx264",
    h265: "libx265",
    av1: "libsvtav1",
    vp9: "libvpx-vp9",
};

// F2 Basic — emit the codec/scale/burn-subs args. caller is responsible for
// ensuring -c:v copy is replaced with these. returns null if no conversion
// is wanted.
const buildVideoConversionArgs = (streamInfo, subsInputIndex = null) => {
    if (!wantsConversion(streamInfo)) return null;

    const args = [];
    const filters = [];

    if (streamInfo.targetHeight && streamInfo.targetHeight !== "source") {
        filters.push(`scale=-2:${streamInfo.targetHeight}`);
    }

    if (streamInfo.burnSubtitles && subsInputIndex !== null) {
        // hardcode the soft subtitle track into pixels via the subtitles filter.
        filters.push(`subtitles='${subsInputIndex}:0'`);
    }

    if (filters.length > 0) {
        args.push("-vf", filters.join(","));
    }

    const targetCodec = codecMap[streamInfo.videoCodec] ?? codecMap.h264;
    args.push("-c:v", targetCodec, "-preset", "veryfast", "-crf", "23");

    return args;
};

// resolve the on-disk output container, honouring the videoContainer override.
const resolveFormat = (streamInfo) => {
    if (streamInfo.videoContainer && streamInfo.videoContainer !== "auto") {
        return streamInfo.videoContainer;
    }
    return streamInfo.filename.split(".").pop();
};

const convertMetadataToFFmpeg = (metadata) => {
    const args = [];

    for (const [ name, value ] of Object.entries(metadata)) {
        if (metadataTags.has(name)) {
            if (name === "sublanguage") {
                args.push('-metadata:s:s:0', `language=${value}`);
                continue;
            }
            args.push('-metadata', `${name}=${value.replace(/[\u0000-\u0009]/g, '')}`); // skipcq: JS-0004
        } else {
            throw `${name} metadata tag is not supported.`;
        }
    }

    return args;
}

const killProcess = (p) => {
    p?.kill('SIGTERM'); // ask the process to terminate itself gracefully

    setTimeout(() => {
        if (p?.exitCode === null)
            p?.kill('SIGKILL'); // brutally murder the process if it didn't quit
    }, 5000);
}

const getCommand = (args) => {
    if (typeof env.processingPriority === 'number' && !isNaN(env.processingPriority)) {
        return ['nice', ['-n', env.processingPriority.toString(), ffmpeg, ...args]]
    }
    return [ffmpeg, args]
}

const render = async (res, streamInfo, ffargs, estimateMultiplier) => {
    let process;
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const shutdown = () => (
        killProcess(process),
        closeResponse(res),
        urls.map(destroyInternalStream)
    );

    try {
        const args = [
            '-loglevel', '-8',
            ...ffargs,
        ];

        process = spawn(...getCommand(args), {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe'
            ],
        });

        const [,,, muxOutput] = process.stdio;

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', contentDisposition(streamInfo.filename));

        res.setHeader(
            'Estimated-Content-Length',
            await estimateTunnelLength(streamInfo, estimateMultiplier)
        );

        pipe(muxOutput, res, shutdown);

        process.on('close', shutdown);
        res.on('finish', shutdown);
    } catch {
        shutdown();
    }
}

const remux = async (streamInfo, res) => {
    const format = resolveFormat(streamInfo);
    const urls = Array.isArray(streamInfo.urls) ? streamInfo.urls : [streamInfo.urls];
    const args = buildInputs(urls, streamInfo);

    // if the stream type is merge, we expect two URLs
    if (streamInfo.type === 'merge' && urls.length !== 2) {
        return closeResponse(res);
    }

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) {
        args.push('-t', trimDuration);
    }

    // burn-subs needs the subtitle source as an input the filter graph can
    // reference by index. when burnSubtitles is on, attach the subtitle as
    // an input (no -map for it) so subtitles= can read it.
    let subsInputIndex = null;
    const burnSubs = streamInfo.burnSubtitles && streamInfo.subtitles;
    if (burnSubs) {
        subsInputIndex = urls.length;
        args.push('-i', streamInfo.subtitles);
    } else if (streamInfo.subtitles) {
        args.push(
            '-i', streamInfo.subtitles,
            '-map', `${urls.length}:s`,
            '-c:s', format === 'mp4' ? 'mov_text' : 'webvtt',
        );
    }

    if (urls.length === 2) {
        args.push(
            '-map', '0:v',
            '-map', '1:a',
        );
    } else {
        args.push(
            '-map', '0:v:0',
            '-map', '0:a:0'
        );
    }

    const conversionArgs = buildVideoConversionArgs(streamInfo, subsInputIndex);
    if (conversionArgs) {
        args.push(...conversionArgs);
    } else {
        args.push('-c:v', 'copy');
    }
    args.push(
        ...(streamInfo.type === 'mute' ? ['-an'] : ['-c:a', 'copy'])
    );

    if (format === 'mp4') {
        args.push('-movflags', 'faststart+frag_keyframe+empty_moov');
    }

    if (streamInfo.type !== 'mute' && streamInfo.isHLS && hlsExceptions.has(streamInfo.service)) {
        if (streamInfo.service === 'youtube' && format === 'webm') {
            args.push('-c:a', 'libopus');
        } else {
            args.push('-c:a', 'aac', '-bsf:a', 'aac_adtstoasc');
        }
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push('-f', format === 'mkv' ? 'matroska' : format, 'pipe:3');

    await render(res, streamInfo, args);
}

const convertAudio = async (streamInfo, res) => {
    const inputArgs = [];
    if (streamInfo.trimStart) inputArgs.push('-ss', streamInfo.trimStart);
    inputArgs.push('-i', streamInfo.urls);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) inputArgs.push('-t', trimDuration);

    const args = [
        ...inputArgs,
        '-vn',
        ...(streamInfo.audioCopy ? ['-c:a', 'copy'] : ['-b:a', `${streamInfo.audioBitrate}k`]),
    ];

    if (streamInfo.audioFormat === 'mp3' && streamInfo.audioBitrate === '8') {
        args.push('-ar', '12000');
    }

    if (streamInfo.audioFormat === 'opus') {
        args.push('-vbr', 'off');
    }

    if (streamInfo.audioFormat === 'mp4a') {
        args.push('-movflags', 'frag_keyframe+empty_moov');
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push(
        '-f',
        streamInfo.audioFormat === 'm4a' ? 'ipod' : streamInfo.audioFormat,
        'pipe:3',
    );

    await render(
        res,
        streamInfo,
        args,
        estimateAudioMultiplier(streamInfo) * 1.1,
    );
}

const convertGif = async (streamInfo, res) => {
    const inputArgs = [];
    if (streamInfo.trimStart) inputArgs.push('-ss', streamInfo.trimStart);
    inputArgs.push('-i', streamInfo.urls);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) inputArgs.push('-t', trimDuration);

    const args = [
        ...inputArgs,

        '-vf',
        'scale=-1:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
        '-loop', '0',

        '-f', 'gif', 'pipe:3',
    ];

    await render(
        res,
        streamInfo,
        args,
        60,
    );
}

export default {
    remux,
    convertAudio,
    convertGif,
}
