import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import { create as contentDisposition } from "content-disposition-header";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

// pick the primary (video) URL from streamInfo.urls. for YouTube and other
// DASH sources, urls is [video, audio] and the gif/webp/thumbnail flows
// only need the video stream.
const primarySource = (streamInfo) =>
    Array.isArray(streamInfo.urls) ? streamInfo.urls[0] : streamInfo.urls;

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
// fetch a remote subtitle URL into a temp file and return the path.
// the caller is responsible for cleaning up the parent dir via cleanup().
//
// background: ffmpeg's `subtitles=` filter reads from a file path/URL
// argument, not a stream index. cobalt's original code passed
// `subtitles='1:0'` (referring to input index 1, stream 0) which is
// invalid filter syntax and silently produced 0-byte downloads on every
// burnSubtitles request. fetching the subtitle into a temp file and
// passing the path gives the filter the format it actually expects,
// without having to whitelist http for the subtitles-filter loader
// (which has restrictive protocol_whitelist defaults).
const materializeSubtitle = async (url) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'snag-subs-'));
    const filename = path.join(dir, 'subs.vtt');
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`subtitle fetch ${r.status}`);
    await writeFile(filename, Buffer.from(await r.arrayBuffer()));
    return {
        path: filename,
        cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {})
    };
};

// escape a path for inclusion inside an ffmpeg filter expression.
// ffmpeg filter syntax uses ':' to separate options and ',' to chain
// filters, so paths containing those characters need backslash-escapes.
// we also escape backslashes themselves and single quotes.
const escapeFilterArg = (s) =>
    s.replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
        .replace(/,/g, '\\,');

const buildVideoConversionArgs = (streamInfo, _legacySubsInputIndex = null) => {
    if (!wantsConversion(streamInfo)) return null;

    const args = [];
    const filters = [];

    if (streamInfo.targetHeight && streamInfo.targetHeight !== "source") {
        filters.push(`scale=-2:${streamInfo.targetHeight}`);
    }

    if (streamInfo.burnSubtitles && streamInfo.burnSubtitlesPath) {
        // hardcode the subtitle file into pixels via the subtitles filter.
        // the path was materialised to disk by materializeSubtitle() before
        // ffmpeg spawned, so the filter just reads it from local fs — no
        // protocol_whitelist gymnastics needed.
        filters.push(`subtitles='${escapeFilterArg(streamInfo.burnSubtitlesPath)}'`);
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
            // -loglevel error: surface real ffmpeg failures (codec issues,
            // bad input, network errors). cobalt's -8 silences everything
            // and turns failures into 0-byte downloads with no diagnostic.
            // for self-hosted, errors in console >> silent corruption.
            '-loglevel', 'error',
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

    // if the stream type is merge, we expect two URLs
    if (streamInfo.type === 'merge' && urls.length !== 2) {
        // log loudly: this used to silently produce a 0-byte download
        // because closeResponse fires before any bytes hit the wire.
        // when service handlers return type:"merge" but a single URL,
        // it's a real bug worth seeing in logs.
        console.error(
            `[ffmpeg] type=merge expected 2 URLs, got ${urls.length} (service: ${streamInfo.service ?? 'unknown'})`
        );
        return closeResponse(res);
    }

    // burnSubtitles: ffmpeg's subtitles= filter takes a file path (not
    // a stream index — that was cobalt's bug). materialise the URL into
    // a temp file before spawning ffmpeg, attach the path to streamInfo,
    // and clean up after.
    let burnCleanup = null;
    if (streamInfo.burnSubtitles && streamInfo.subtitles) {
        try {
            const sub = await materializeSubtitle(streamInfo.subtitles);
            streamInfo.burnSubtitlesPath = sub.path;
            burnCleanup = sub.cleanup;
        } catch (err) {
            console.error(`[ffmpeg] burnSubtitles fetch failed:`, err.message);
            // soft-fail: emit the video without burned subs rather than
            // silently producing 0 bytes.
        }
    }

    const args = buildInputs(urls, streamInfo);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) {
        args.push('-t', trimDuration);
    }

    // soft subtitles: attach as an input so the muxer can include them.
    // (burnSubs path doesn't add subs as an input — they're consumed by
    // the subtitles= filter from disk instead.)
    if (streamInfo.subtitles && !streamInfo.burnSubtitles) {
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

    // subsInputIndex is now legacy (burnSubtitles uses a file path, not
    // a stream index) — kept null to satisfy buildVideoConversionArgs's
    // signature without changing every caller.
    const conversionArgs = buildVideoConversionArgs(streamInfo, null);
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

    // F2 Polish — loudnorm forces an audio re-encode and overrides any
    // earlier -c:a copy / hls codec choice. only applies when there's
    // an audio track to normalise.
    const remuxLoudnorm = loudnormFilter(streamInfo.normalizeAudio);
    if (remuxLoudnorm && streamInfo.type !== 'mute') {
        const ab = streamInfo.audioBitrate || '192';
        args.push('-af', remuxLoudnorm, '-c:a', 'aac', '-b:a', `${ab}k`);
    }

    if (streamInfo.metadata) {
        args.push(...convertMetadataToFFmpeg(streamInfo.metadata));
    }

    args.push('-f', format === 'mkv' ? 'matroska' : format, 'pipe:3');

    try {
        await render(res, streamInfo, args);
    } finally {
        if (burnCleanup) await burnCleanup();
    }
}

// F2 Polish — ffmpeg loudnorm filter targets. EBU R128 is the streaming
// default (-23 LUFS); broadcast is the louder TV/web cut (-16 LUFS).
const loudnormFilter = (mode) => {
    if (mode === "ebu") return "loudnorm=I=-23:LRA=7:TP=-2";
    if (mode === "broadcast") return "loudnorm=I=-16:LRA=11:TP=-1";
    return null;
};

const convertAudio = async (streamInfo, res) => {
    const inputArgs = [];
    if (streamInfo.trimStart) inputArgs.push('-ss', streamInfo.trimStart);
    inputArgs.push('-i', streamInfo.urls);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) inputArgs.push('-t', trimDuration);

    // loudnorm forces a re-encode, so it's incompatible with -c:a copy.
    const loudnorm = loudnormFilter(streamInfo.normalizeAudio);
    const audioCopy = streamInfo.audioCopy && !loudnorm;

    const args = [
        ...inputArgs,
        '-vn',
        ...(loudnorm ? ['-af', loudnorm] : []),
        ...(audioCopy ? ['-c:a', 'copy'] : ['-b:a', `${streamInfo.audioBitrate}k`]),
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
    // gif and webp run a filter graph (palettegen/paletteuse, libwebp), so
    // they need clean decoded frames at the trim boundary. fast input-side
    // -ss before -i lands on a non-keyframe under DASH/HLS sources and
    // leaves the filter chain with nothing to encode (-> empty output).
    // use *output*-side seek (-ss after -i) here: slower, but reliable.
    const inputArgs = ['-i', primarySource(streamInfo)];
    if (streamInfo.trimStart) inputArgs.push('-ss', streamInfo.trimStart);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) inputArgs.push('-t', trimDuration);

    // honour targetHeight when set; otherwise scale=-1:-1 keeps source dims.
    const scale =
        streamInfo.targetHeight && streamInfo.targetHeight !== "source"
            ? `scale=-2:${streamInfo.targetHeight}:flags=lanczos`
            : `scale=-1:-1:flags=lanczos`;

    const args = [
        ...inputArgs,

        '-vf',
        `${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        '-loop', '0',
        '-an',

        '-f', 'gif', 'pipe:3',
    ];

    await render(
        res,
        streamInfo,
        args,
        60,
    );
}

// F2 Polish — animated WebP via libwebp. accepts trim window like the
// other flows. resize (targetHeight) honoured if set; default 480.
const convertWebP = async (streamInfo, res) => {
    // see convertGif comment — output-side seek for filter-graph correctness.
    const inputArgs = ['-i', primarySource(streamInfo)];
    if (streamInfo.trimStart) inputArgs.push('-ss', streamInfo.trimStart);

    const trimDuration = computeTrimDuration(streamInfo);
    if (trimDuration) inputArgs.push('-t', trimDuration);

    const targetHeight =
        streamInfo.targetHeight && streamInfo.targetHeight !== "source"
            ? streamInfo.targetHeight
            : "480";

    const args = [
        ...inputArgs,
        '-vf', `scale=-2:${targetHeight}:flags=lanczos`,
        '-c:v', 'libwebp',
        '-loop', '0',
        '-q:v', '70',
        '-an',
        '-f', 'webp', 'pipe:3',
    ];

    await render(res, streamInfo, args, 30);
};

// F2 Polish — single JPEG frame at thumbnailAt. fast input seek with
// -frames:v 1 keeps it cheap.
const convertThumbnail = async (streamInfo, res) => {
    const at = streamInfo.thumbnailAt || "0";
    const args = [
        '-ss', at,
        '-i', primarySource(streamInfo),
        '-frames:v', '1',
        '-q:v', '2',
        '-an',
        '-f', 'mjpeg', 'pipe:3',
    ];

    await render(res, streamInfo, args, 1);
};

export default {
    remux,
    convertAudio,
    convertGif,
    convertWebP,
    convertThumbnail,
}
