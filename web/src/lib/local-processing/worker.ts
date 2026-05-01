// FFmpeg-WASM remux worker for snag local-processing.
//
// the snag api returns `local-processing` when it can't (or shouldn't)
// merge the streams server-side — most commonly for high-quality YouTube
// DASH where the audio and video are separate streams. this worker:
//
//   1. fetches each tunnel URL into an in-memory ArrayBuffer.
//   2. spins up libav.js (single-threaded WASM build, no SAB needed).
//   3. mounts each input into libav's virtual filesystem.
//   4. runs `ffmpeg -i video -i audio -c copy -map 0:v -map 1:a output`.
//   5. reads the muxed output back, hands it to the main thread as a Blob.
//
// streaming-into-libav (lower memory) is more sophisticated and is on the
// roadmap; this remux-from-buffers path covers the common case cleanly.

/// <reference lib="webworker" />

// LibAV's namespace exposes both the wrapper (with statics) and the
// `LibAV()` factory. since the d.ts ships only the namespace shape, we
// reach for the factory via runtime access — type-asserting it as any
// avoids fighting the (overly conservative) declarations.
import LibAVNS from '@imput/libav.js-remux-cli';
import type { ProcessRequest, ProcessUpdate } from './types';

const LibAV = (LibAVNS as unknown as {
    LibAV: (opts?: Record<string, unknown>) => Promise<{
        writeFile: (name: string, data: Uint8Array) => Promise<unknown>;
        readFile: (name: string) => Promise<Uint8Array>;
        unlink: (name: string) => Promise<unknown>;
        ffmpeg: (...args: string[]) => Promise<number>;
    }>;
}).LibAV;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: ProcessUpdate, transfer: Transferable[] = []) {
    ctx.postMessage(msg, transfer);
}

async function fetchInto(url: string, label: string, id: string): Promise<Uint8Array> {
    post({ id, kind: 'progress', phase: `fetching ${label}…` });
    const r = await fetch(url);
    if (!r.ok) {
        throw new Error(`fetch ${label} ${r.status}`);
    }
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
}

function pickExtension(filename: string | undefined, fallback: string): string {
    if (!filename) return fallback;
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return fallback;
    return filename.slice(dot + 1).toLowerCase() || fallback;
}

ctx.addEventListener('message', async (ev: MessageEvent<ProcessRequest>) => {
    const { id, response } = ev.data;
    try {
        if (response.tunnel.length < 1) {
            throw new Error('no tunnels');
        }

        // fetch every tunnel in parallel. for the typical merge case there
        // are exactly two (video + audio); other types may have more.
        const buffers = await Promise.all(
            response.tunnel.map((url, i) => fetchInto(url, `stream ${i + 1}`, id))
        );

        post({ id, kind: 'progress', phase: 'starting libav.js…' });
        const libav = await LibAV({ noworker: true });

        const baseExt = pickExtension(response.output?.filename, 'mp4');
        const inputNames = buffers.map((_, i) => `in${i}.${baseExt}`);
        const outputName = `out.${baseExt}`;
        const outputType = response.output?.type ?? 'video/mp4';

        // write each buffer into libav's virtual fs
        for (let i = 0; i < buffers.length; i++) {
            await libav.writeFile(inputNames[i], buffers[i]);
        }

        post({ id, kind: 'progress', phase: 'remuxing…' });

        // construct ffmpeg argv. for merge (n inputs), map video from input 0
        // and audio from input 1 if a second input exists; otherwise just
        // pass the lot through with -c copy.
        const args: string[] = [];
        for (const name of inputNames) {
            args.push('-i', name);
        }
        args.push('-c', 'copy');
        if (inputNames.length >= 2) {
            args.push('-map', '0:v?', '-map', '1:a?');
        }
        if (baseExt === 'mp4') {
            args.push('-movflags', '+faststart');
        }
        args.push(outputName);

        const code = await libav.ffmpeg(...args);
        if (code !== 0) {
            throw new Error(`libav.ffmpeg returned ${code}`);
        }

        const out = await libav.readFile(outputName);
        // Blob() picky about Uint8Array<ArrayBufferLike>; resolve via .buffer
        // slice so the type is plain ArrayBuffer.
        const blob = new Blob([out.slice().buffer as ArrayBuffer], { type: outputType });

        // tidy up so the wasm heap can shrink
        for (const name of [...inputNames, outputName]) {
            try {
                await libav.unlink(name);
            } catch {
                /* best effort */
            }
        }

        const filename = response.output?.filename ?? `snag-output.${baseExt}`;
        post({ id, kind: 'done', blob, filename });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        post({ id, kind: 'error', code: 'local.processing_failed', detail });
    }
});
