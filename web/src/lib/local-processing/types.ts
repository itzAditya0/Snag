// shared types between the local-processing main thread and worker.

import type { LocalProcessingResponse } from '$types/api';

// payload sent from main -> worker
export interface ProcessRequest {
    id: string;
    response: LocalProcessingResponse;
}

// payloads sent from worker -> main
export type ProcessUpdate =
    | { id: string; kind: 'progress'; phase: string; ratio?: number }
    | { id: string; kind: 'done'; blob: Blob; filename: string }
    | { id: string; kind: 'error'; code: string; detail?: string };
