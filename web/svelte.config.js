import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
        alias: {
            $components: 'src/components',
            $lib: 'src/lib',
            $stores: 'src/lib/stores',
            $types: 'src/lib/types'
        }
    }
};

export default config;
