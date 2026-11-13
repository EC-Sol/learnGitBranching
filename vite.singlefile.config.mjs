import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { cjsLazyInterop } from './vite.config.mjs';

/**
 * Standalone single-file build config (used by scripts/build-singlefile.js).
 *
 * Mirrors vite.config.mjs's plugins/transforms but disables code splitting:
 * levels and locales are normally code-split and fetched on demand, which
 * cannot work for a single offline HTML file. `inlineDynamicImports` merges
 * every dynamic chunk (all levels + all locale strings) into the single app
 * bundle so the emitted page can be inlined into one self-contained HTML
 * file with no network requests at all.
 *
 * Google Analytics and the upsell banner are stripped afterwards by the
 * post-processing script, since they are meaningless offline.
 */
export default defineConfig({
  base: './',
  plugins: [
    viteCommonjs(),
    cjsLazyInterop(),
    nodePolyfills(),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    jsx: 'transform',
  },
  build: {
    outDir: 'build-singlefile',
    emptyOutDir: true,
    // Keep the legacy vendor fallbacks intact (see vite.config.mjs).
    cssMinify: 'esbuild',
    rollupOptions: {
      output: {
        // Everything in one JS chunk: no dynamic import() URLs are left in
        // the output, so the post-processing script can inline the module
        // script as-is and the page works from file:// with zero requests.
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/chunk.js',
        assetFileNames: 'assets/app.[ext]',
      },
    },
  },
});