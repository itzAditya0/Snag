import { apiURL } from '$lib/env';
import type { SnagRequest, SnagResponse } from '$types/api';

export class SnagAPIError extends Error {
    constructor(
        public code: string,
        public context?: Record<string, unknown>
    ) {
        super(code);
        this.name = 'SnagAPIError';
    }
}

export async function submit(req: SnagRequest, apiKey?: string): Promise<SnagResponse> {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json'
    };

    if (apiKey) {
        headers['authorization'] = `Api-Key ${apiKey}`;
    }

    let res: Response;
    try {
        res = await fetch(apiURL + '/', {
            method: 'POST',
            headers,
            body: JSON.stringify(req)
        });
    } catch (e) {
        throw new SnagAPIError('network.unreachable', { detail: String(e) });
    }

    let body: SnagResponse;
    try {
        body = await res.json();
    } catch {
        throw new SnagAPIError('network.invalid_json', { httpStatus: res.status });
    }

    return body;
}

export async function instanceInfo(): Promise<{
    cobalt?: { version?: string; services?: string[] };
    snag?: { version?: string; services?: string[] };
    git?: { commit?: string; branch?: string };
}> {
    const res = await fetch(apiURL + '/');
    if (!res.ok) {
        throw new SnagAPIError('instance.unreachable', { httpStatus: res.status });
    }
    return res.json();
}
