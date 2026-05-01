import { browser } from '$app/environment';
import { submit, SnagAPIError } from '$lib/api/client';
import type { SnagRequest, SnagResponse } from '$types/api';

export type QueueStatus = 'pending' | 'fetching' | 'ready' | 'error';

export interface QueueItem {
    id: string;
    url: string;
    options: Partial<SnagRequest>;
    status: QueueStatus;
    submittedAt: number;
    completedAt?: number;
    filename?: string;
    downloadUrl?: string;
    pickerCount?: number;
    errorCode?: string;
}

const STORAGE_KEY = 'snag.queue.v1';
const MAX_ITEMS = 200;

function makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function load(): QueueItem[] {
    if (!browser) return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, MAX_ITEMS).map((it) => {
            // any in-flight items from a previous tab are stale; drop to error
            // so the user can retry rather than seeing a forever-loading row.
            if (it && (it.status === 'pending' || it.status === 'fetching')) {
                return { ...it, status: 'error', errorCode: 'queue.interrupted' };
            }
            return it;
        });
    } catch {
        return [];
    }
}

function save(items: QueueItem[]) {
    if (!browser) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    } catch {
        /* quota / disabled / private mode — silently ignore */
    }
}

// reactive list. newest items first.
export const queue = $state<{ items: QueueItem[] }>({ items: load() });

export function installQueuePersistence() {
    $effect(() => {
        // touching .items + each item's status tracks changes shallowly enough
        // that writes happen on add / status transition.
        const snapshot = queue.items.map((it) => ({ ...it }));
        save(snapshot);
    });
}

function summariseResponse(item: QueueItem, resp: SnagResponse): QueueItem {
    const completedAt = Date.now();
    if (resp.status === 'error') {
        return { ...item, status: 'error', errorCode: resp.error.code, completedAt };
    }
    if (resp.status === 'redirect' || resp.status === 'tunnel') {
        return {
            ...item,
            status: 'ready',
            filename: resp.filename,
            downloadUrl: resp.url,
            completedAt
        };
    }
    if (resp.status === 'picker') {
        return {
            ...item,
            status: 'ready',
            pickerCount: resp.picker?.length ?? 0,
            completedAt
        };
    }
    if (resp.status === 'local-processing') {
        return {
            ...item,
            status: 'ready',
            filename: resp.output?.filename,
            completedAt
        };
    }
    return { ...item, status: 'error', errorCode: 'queue.unknown_response', completedAt };
}

function replace(id: string, mut: (it: QueueItem) => QueueItem) {
    const idx = queue.items.findIndex((q) => q.id === id);
    if (idx === -1) return;
    queue.items[idx] = mut(queue.items[idx]);
}

async function fetchOne(id: string) {
    const item = queue.items.find((q) => q.id === id);
    if (!item) return;
    replace(id, (it) => ({ ...it, status: 'fetching' }));

    try {
        const req: SnagRequest = { ...item.options, url: item.url };
        const resp = await submit(req);
        replace(id, (it) => summariseResponse(it, resp));
    } catch (e) {
        const code =
            e instanceof SnagAPIError ? e.code : 'queue.unexpected';
        replace(id, (it) => ({ ...it, status: 'error', errorCode: code, completedAt: Date.now() }));
    }
}

// add a single submission to the queue + kick off the request.
export function enqueueOne(url: string, options: Partial<SnagRequest> = {}): string {
    const id = makeId();
    const item: QueueItem = {
        id,
        url,
        options,
        status: 'pending',
        submittedAt: Date.now()
    };
    queue.items = [item, ...queue.items].slice(0, MAX_ITEMS);
    void fetchOne(id);
    return id;
}

// paste-many: enqueue every url with the given shared options, run with
// bounded concurrency so we don't hammer upstream services from one tab.
export async function enqueueMany(
    urls: string[],
    options: Partial<SnagRequest> = {},
    concurrency = 4
): Promise<void> {
    const ids = urls.map((url) => {
        const id = makeId();
        const item: QueueItem = {
            id,
            url,
            options,
            status: 'pending',
            submittedAt: Date.now()
        };
        queue.items = [item, ...queue.items].slice(0, MAX_ITEMS);
        return id;
    });

    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (cursor < ids.length) {
            const i = cursor++;
            await fetchOne(ids[i]);
        }
    });
    await Promise.all(workers);
}

export function retryItem(id: string) {
    void fetchOne(id);
}

export function dismissItem(id: string) {
    queue.items = queue.items.filter((q) => q.id !== id);
}

export function clearQueue() {
    queue.items = [];
}
