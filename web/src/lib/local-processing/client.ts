// thin main-thread wrapper around the local-processing worker. exposes a
// promise-based API: `process(response)` -> `{ blobUrl, filename }` after
// the worker finishes the remux. `onProgress` reports phase strings.

import type { LocalProcessingResponse } from '$types/api';
import type { ProcessUpdate } from './types';

export interface ProcessHandle {
    cancel(): void;
    promise: Promise<{ blobUrl: string; filename: string }>;
}

let nextId = 1;

export function processLocally(
    response: LocalProcessingResponse,
    onProgress?: (phase: string) => void
): ProcessHandle {
    const id = `lp-${nextId++}`;

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: `snag-local-processing-${id}`
    });

    let cancelled = false;

    const promise = new Promise<{ blobUrl: string; filename: string }>((resolve, reject) => {
        worker.addEventListener('message', (ev: MessageEvent<ProcessUpdate>) => {
            const msg = ev.data;
            if (msg.id !== id) return;
            if (cancelled) return;
            if (msg.kind === 'progress') {
                onProgress?.(msg.phase);
            } else if (msg.kind === 'done') {
                const blobUrl = URL.createObjectURL(msg.blob);
                resolve({ blobUrl, filename: msg.filename });
                worker.terminate();
            } else if (msg.kind === 'error') {
                reject(new Error(msg.detail ?? msg.code));
                worker.terminate();
            }
        });
        worker.addEventListener('error', (ev) => {
            reject(new Error(ev.message || 'worker error'));
            worker.terminate();
        });
        worker.postMessage({ id, response });
    });

    return {
        cancel() {
            cancelled = true;
            worker.terminate();
        },
        promise
    };
}
