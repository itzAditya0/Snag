<script lang="ts">
    import { onMount } from 'svelte';
    import { instanceInfo } from '$lib/api/client';

    type Status = 'connecting' | 'ready' | 'offline';

    let active = $state(true);
    let status = $state<Status>('connecting');
    let serviceCount = $state(0);
    let progress = $state(0); // 0..1
    let dragging = $state(false);
    let trackEl: HTMLDivElement | undefined = $state();
    let trackRect: DOMRect | null = null;
    const THRESHOLD = 0.85;

    const year = new Date().getFullYear();

    // ping the api in the background
    onMount(() => {
        instanceInfo()
            .then((info) => {
                const root = info.snag ?? info.cobalt;
                serviceCount = root?.services?.length ?? 0;
                status = 'ready';
            })
            .catch(() => {
                status = 'offline';
            });
    });

    function pad2(n: number): string {
        return n.toString().padStart(2, '0');
    }

    function clamp(n: number, lo = 0, hi = 1): number {
        return Math.max(lo, Math.min(hi, n));
    }

    function toProgress(clientX: number): number {
        if (!trackRect) return progress;
        const rel = (clientX - trackRect.left) / trackRect.width;
        return clamp(rel, 0, 1);
    }

    function startDrag(e: PointerEvent) {
        if (!trackEl) return;
        trackRect = trackEl.getBoundingClientRect();
        dragging = true;
        progress = toProgress(e.clientX);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    function moveDrag(e: PointerEvent) {
        if (!dragging) return;
        progress = toProgress(e.clientX);
    }

    function endDrag(e: PointerEvent) {
        if (!dragging) return;
        dragging = false;
        try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        if (progress >= THRESHOLD) {
            progress = 1;
            setTimeout(() => (active = false), 280);
        } else {
            progress = 0;
        }
    }

    function quickDismiss() {
        progress = 1;
        setTimeout(() => (active = false), 200);
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            quickDismiss();
        }
        if (e.key === 'ArrowRight') {
            progress = clamp(progress + 0.1);
            if (progress >= THRESHOLD) quickDismiss();
        }
        if (e.key === 'ArrowLeft') {
            progress = clamp(progress - 0.1);
        }
    }
</script>

{#if active}
    <div
        class="overlay"
        class:dismissing={progress >= THRESHOLD && !dragging}
        role="dialog"
        aria-modal="true"
        aria-label="snag entry"
    >
        <header class="head">
            <span class="brand">snag.</span>
            <span class="counter mono">{pad2(0)} / {pad2(Math.max(serviceCount, 0))}</span>
        </header>

        <main class="main">
            <h1 class="dict">
                <span class="word">Snag</span>
                <span class="ipa">/snæɡ/</span>
                <span class="defn">
                    <span class="dash">&mdash;</span> to grab,
                </span>
                <span class="defn italic">swiftly.</span>
            </h1>
        </main>

        <footer class="foot">
            <div class="meta-l mono">
                <span class="muted">&copy; {year}</span>
                <span class="muted-faint">v0.1.0</span>
            </div>

            <div class="drag-area">
                <div class="track-row">
                    <div
                        bind:this={trackEl}
                        class="track"
                        role="slider"
                        tabindex="0"
                        aria-label="drag to start"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={Math.round(progress * 100)}
                        onpointerdown={startDrag}
                        onpointermove={moveDrag}
                        onpointerup={endDrag}
                        onpointercancel={endDrag}
                        onkeydown={onKey}
                    >
                        <div class="rail"></div>
                        <div class="thumb" style="left: {progress * 100}%"></div>
                    </div>
                    <span class="catch tracked">we&rsquo;ll catch the rest.</span>
                </div>
                <button class="cta tracked" onclick={quickDismiss}>drag to start</button>
            </div>

            <div class="meta-r mono" aria-live="polite">
                <span class="dot status-dot status-{status}" aria-hidden="true">●</span>
                <span class="status-label status-{status}">
                    {status === 'connecting' ? 'connecting' : status === 'ready' ? 'ready' : 'offline'}
                </span>
            </div>
        </footer>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: var(--bg);
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 2rem var(--gutter);
        opacity: 1;
        transition: opacity 0.28s var(--ease);
    }

    .overlay.dismissing {
        opacity: 0;
        pointer-events: none;
    }

    /* faint grid background as in the mockup */
    .overlay::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
            linear-gradient(rgba(255, 255, 255, 0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.012) 1px, transparent 1px);
        background-size: 80px 80px;
        pointer-events: none;
        mask-image: radial-gradient(ellipse at center, black 30%, transparent 90%);
    }

    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: relative;
    }

    .brand {
        font-size: 1.4rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--text);
    }

    .counter {
        font-size: 0.78rem;
        color: var(--text-muted);
        letter-spacing: 0.06em;
    }

    .main {
        display: flex;
        align-items: center;
        position: relative;
    }

    .dict {
        margin: 0;
        font-family: var(--font-sans);
        font-weight: 600;
        font-size: clamp(3rem, 9vw, 7rem);
        line-height: 1;
        letter-spacing: -0.025em;
        color: var(--text);
        display: flex;
        flex-direction: column;
        gap: 0.05em;
    }

    .ipa {
        font-weight: 400;
    }

    .defn {
        font-weight: 400;
    }

    .defn .dash {
        color: var(--text-muted);
        margin-right: 0.15em;
    }

    .italic {
        font-style: italic;
        font-weight: 500;
    }

    .foot {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: end;
        gap: 1rem;
        padding-top: 2rem;
        position: relative;
    }

    .meta-l {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        font-size: 0.78rem;
    }

    .muted {
        color: var(--text-muted);
    }

    .muted-faint {
        color: var(--text-faint);
    }

    .drag-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.85rem;
        min-width: min(420px, 60vw);
    }

    .track-row {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        width: 100%;
    }

    .track {
        position: relative;
        height: 18px;
        flex: 1;
        cursor: grab;
        touch-action: none;
        display: flex;
        align-items: center;
    }

    .track:active {
        cursor: grabbing;
    }

    .rail {
        height: 1px;
        width: 100%;
        background: var(--text-muted);
    }

    .thumb {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--text);
        box-shadow: 0 0 0 4px rgba(245, 230, 211, 0);
        transition: box-shadow 0.18s var(--ease);
    }

    .track:hover .thumb,
    .track:focus-visible .thumb {
        box-shadow: 0 0 0 4px rgba(245, 230, 211, 0.18);
    }

    .catch {
        color: var(--text-muted);
        white-space: nowrap;
    }

    .cta {
        background: none;
        border: none;
        color: var(--text);
        font-family: var(--font-mono);
        font-size: 0.78rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        padding-bottom: 0.15rem;
        border-bottom: 1px solid var(--text);
        cursor: pointer;
    }

    .meta-r {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        justify-content: flex-end;
        font-size: 0.78rem;
    }

    .status-dot {
        font-size: 0.65rem;
    }

    .status-connecting {
        color: var(--text-muted);
        animation: pulse 1.5s ease-in-out infinite;
    }

    .status-ready {
        color: var(--ready);
    }

    .status-offline {
        color: var(--error);
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 1; }
    }

    @media (max-width: 720px) {
        .overlay {
            padding: 1.25rem var(--gutter-sm);
        }

        .foot {
            grid-template-columns: 1fr;
            gap: 1.5rem;
            text-align: center;
        }

        .meta-l,
        .meta-r {
            justify-content: center;
        }

        .drag-area {
            min-width: 0;
            width: 100%;
        }

        .track-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }
    }
</style>
