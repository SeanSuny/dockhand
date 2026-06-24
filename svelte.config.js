import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ script: true }),

	vitePlugin: {
		prebundleSvelteLibraries: true,
		dynamicCompileOptions({ filename }) {
			// layercake and layerchart still ship Svelte 3/4 components.
			// Force legacy (non-runes) mode for them so Svelte 5 can compile them.
			if (filename.includes('node_modules/layercake') || filename.includes('node_modules/layerchart')) {
				return { runes: false };
			}
		}
	},

	kit: {
		adapter: adapter({
			out: 'build'
		}),
		csrf: {
			trustedOrigins: ['*']
		}
	}
};

export default config;
