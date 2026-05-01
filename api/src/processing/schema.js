import { z } from "zod";
import { normalizeURL } from "./url.js";

export const apiSchema = z.object({
    url: z.string()
          .min(1)
          .transform(url => normalizeURL(url)),

    audioBitrate: z.enum(
        ["320", "256", "128", "96", "64", "8"]
    ).default("128"),

    audioFormat: z.enum(
        ["best", "mp3", "ogg", "wav", "opus"]
    ).default("mp3"),

    downloadMode: z.enum(
        ["auto", "audio", "mute"]
    ).default("auto"),

    filenameStyle: z.enum(
        ["classic", "pretty", "basic", "nerdy"]
    ).default("basic"),

    youtubeVideoCodec: z.enum(
        ["h264", "av1", "vp9"]
    ).default("h264"),

    youtubeVideoContainer: z.enum(
        ["auto", "mp4", "webm", "mkv"]
    ).default("auto"),

    videoQuality: z.enum(
        ["max", "4320", "2160", "1440", "1080", "720", "480", "360", "240", "144"]
    ).default("1080"),

    localProcessing: z.enum(
        ["disabled", "preferred", "forced"]
    ).default("disabled"),

    youtubeDubLang: z.string()
                     .min(2)
                     .max(8)
                     .regex(/^[0-9a-zA-Z\-]+$/)
                     .optional(),

    subtitleLang: z.string()
                     .min(2)
                     .max(8)
                     .regex(/^[0-9a-zA-Z\-]+$/)
                     .optional(),

    disableMetadata: z.boolean().default(false),

    allowH265: z.boolean().default(false),
    convertGif: z.boolean().default(true),

    alwaysProxy: z.boolean().default(false),

    youtubeHLS: z.boolean().default(false),
    youtubeBetterAudio: z.boolean().default(false),

    // F3 — trim. accepts "ss[.mmm]", "mm:ss[.mmm]", or "hh:mm:ss[.mmm]".
    trimStart: z.string()
                .max(16)
                .regex(/^(\d+(\.\d{1,3})?|(\d{1,2}:){1,2}\d{1,2}(\.\d{1,3})?)$/)
                .optional(),
    trimEnd: z.string()
              .max(16)
              .regex(/^(\d+(\.\d{1,3})?|(\d{1,2}:){1,2}\d{1,2}(\.\d{1,3})?)$/)
              .optional(),

    // F2 Basic — output format conversion (post-extraction, server-side).
    // any non-default value forces the response through FFmpeg.
    videoCodec: z.enum(["auto", "h264", "h265", "av1", "vp9"]).default("auto"),
    videoContainer: z.enum(["auto", "mp4", "mkv", "webm"]).default("auto"),
    targetHeight: z.enum(["source", "2160", "1440", "1080", "720", "480", "360"]).default("source"),
    burnSubtitles: z.boolean().default(false),

    // F2 Polish — switch the whole output pipeline.
    //  video      — default; honours all the F2 Basic knobs
    //  gif        — animated gif via the existing palette/paletteuse chain
    //  webp       — animated webp via libwebp
    //  audio      — force audio-only regardless of downloadMode
    outputFormat: z.enum(["video", "gif", "webp", "audio"]).default("video"),

    // F2 Polish — apply ffmpeg loudnorm to the audio track. ebu R128
    // targets streaming-friendly -23 LUFS; broadcast targets -16 LUFS.
    normalizeAudio: z.enum(["off", "ebu", "broadcast"]).default("off"),

    // F2 Polish — return a single JPEG frame at the given timestamp
    // instead of streaming the full media. accepts the same time format
    // as trimStart / trimEnd.
    thumbnailAt: z.string()
                  .max(16)
                  .regex(/^(\d+(\.\d{1,3})?|(\d{1,2}:){1,2}\d{1,2}(\.\d{1,3})?)$/)
                  .optional(),
})
.strict();
