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
        return `snag_${index + 1}.${ext(item)}`;
    }

    function emojiFor(type: PickerItem['type']): string {
        if (type === 'photo') return '\u{1F5BC}\u{FE0F}';
        if (type === 'gif') return '\u{1F4F8}';
        return '\u{1F3AC}';
    }
</script>

<div class="picker">
    <p class="summary">
        this URL contains <strong>{items.length}</strong>
        {items.length === 1 ? 'item' : 'items'}. pick what you want.
    </p>

    {#if response.audio}
        <div class="audio-row">
            <span class="audio-label">soundtrack:</span>
            <a class="dl" href={response.audio} download={response.audioFilename ?? 'audio'}>
                download audio
            </a>
        </div>
    {/if}

    <div class="grid">
        {#each items as item, i}
            <div class="item">
                {#if item.thumb}
                    <a class="thumb" href={item.url} download={suggestedName(item, i)}>
                        <img src={item.thumb} alt={`item ${i + 1}`} loading="lazy" />
                    </a>
                {:else}
                    <a class="thumb placeholder" href={item.url} download={suggestedName(item, i)}>
                        <span class="emoji">{emojiFor(item.type)}</span>
                    </a>
                {/if}
                <div class="meta">
                    <span class="type">{item.type}</span>
                    <a class="dl small" href={item.url} download={suggestedName(item, i)}>
                        download
                    </a>
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .picker {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .summary {
        margin: 0;
        color: var(--text);
    }

    .summary strong {
        color: var(--accent);
    }

    .audio-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        padding: 0.75rem 1rem;
        background: var(--surface-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
    }

    .audio-label {
        font-size: 0.9rem;
        color: var(--text-muted);
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 0.75rem;
    }

    .item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
    }

    .thumb {
        display: block;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--surface-elevated);
    }

    .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .thumb.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .thumb .emoji {
        font-size: 2rem;
    }

    .meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0.6rem 0.6rem;
        gap: 0.5rem;
    }

    .type {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .dl {
        display: inline-block;
        padding: 0.4rem 0.7rem;
        background: var(--accent);
        color: var(--accent-text);
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
        font-weight: 500;
        text-decoration: none;
    }

    .dl.small {
        padding: 0.25rem 0.55rem;
        font-size: 0.78rem;
    }

    .dl:hover {
        background: var(--accent-hover);
        text-decoration: none;
    }
</style>
