<script lang="ts">
    import type { PickerResponse, PickerItem } from '$types/api';

    type Props = {
        response: PickerResponse;
    };

    const { response }: Props = $props();
    const items = $derived<PickerItem[]>(response.picker ?? []);

    function ext(item: PickerItem): string {
        if (item.type === 'photo') return 'jpg';
        if (item.type === 'gif') return 'gif';
        return 'mp4';
    }

    function suggestedName(item: PickerItem, index: number): string {
        return `snag_${String(index + 1).padStart(2, '0')}.${ext(item)}`;
    }
</script>

<div class="picker">
    <p class="result-label tracked">
        {items.length} item{items.length === 1 ? '' : 's'}
        {#if response.audio} &middot; soundtrack available{/if}
    </p>

    {#if response.audio}
        <a class="audio-row" href={response.audio} download={response.audioFilename ?? 'audio'}>
            <span class="audio-icon" aria-hidden="true">&#9836;</span>
            <span class="audio-label">download soundtrack</span>
            <span class="audio-arrow" aria-hidden="true">&rarr;</span>
        </a>
    {/if}

    <div class="grid">
        {#each items as item, i}
            <a class="item" href={item.url} download={suggestedName(item, i)}>
                <div class="thumb" class:placeholder={!item.thumb}>
                    {#if item.thumb}
                        <img src={item.thumb} alt="" loading="lazy" />
                    {/if}
                    <span class="index mono">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div class="meta">
                    <span class="type mono">{item.type}</span>
                    <span class="dl-arrow" aria-hidden="true">&darr;</span>
                </div>
            </a>
        {/each}
    </div>
</div>

<style>
    .picker {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .result-label {
        margin: 0;
        color: var(--text-muted);
    }

    .audio-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0;
        border-bottom: 1px solid var(--text);
        color: var(--text);
        transition: color 0.15s var(--ease), border-color 0.15s var(--ease);
    }

    .audio-row:hover {
        color: var(--accent);
        border-bottom-color: var(--accent);
    }

    .audio-icon {
        font-size: 1rem;
        color: var(--text-muted);
    }

    .audio-row:hover .audio-icon {
        color: var(--accent);
    }

    .audio-label {
        flex: 1;
        font-size: 0.95rem;
    }

    .audio-arrow {
        color: var(--text-muted);
        transition: color 0.15s var(--ease), transform 0.15s var(--ease);
    }

    .audio-row:hover .audio-arrow {
        color: var(--accent);
        transform: translateX(2px);
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.5rem;
    }

    .item {
        display: flex;
        flex-direction: column;
        gap: 0;
        color: var(--text);
        transition: opacity 0.15s var(--ease);
    }

    .item:hover {
        opacity: 1;
    }

    .thumb {
        position: relative;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--surface);
        border: 1px solid var(--line-strong);
        transition: border-color 0.15s var(--ease);
    }

    .item:hover .thumb {
        border-color: var(--text);
    }

    .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.18s var(--ease);
    }

    .item:hover .thumb img {
        transform: scale(1.02);
    }

    .thumb.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .index {
        position: absolute;
        top: 0.4rem;
        left: 0.4rem;
        font-size: 0.7rem;
        letter-spacing: 0.06em;
        color: var(--text);
        background: rgba(10, 10, 10, 0.7);
        padding: 0.1rem 0.35rem;
        border-radius: 0.15em;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
    }

    .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.1rem;
    }

    .type {
        font-size: 0.7rem;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        text-transform: uppercase;
    }

    .dl-arrow {
        color: var(--text-muted);
        font-size: 0.85rem;
        transition: color 0.15s var(--ease), transform 0.15s var(--ease);
    }

    .item:hover .dl-arrow {
        color: var(--accent);
        transform: translateY(2px);
    }
</style>
