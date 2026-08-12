import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const shouldOpenBrowser = process.env.VITE_NO_OPEN !== '1';

/**
 * Models, textures and manifests are loaded dynamically at runtime, so Vite
 * cannot discover them from the module graph. Preserve their `assets/...` URLs
 * by copying the asset library into the production output after bundling.
 */
function copyRuntimeAssets() {
  let outputDirectory = 'dist';

  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    async closeBundle() {
      const destination = resolve(outputDirectory, 'assets');
      await mkdir(destination, { recursive: true });
      await cp(resolve('assets'), destination, {
        recursive: true,
        force: true,
      });
    },
  };
}

export default defineConfig({
  // Relative bundle URLs also support deployment below a domain subdirectory.
  base: './',
  publicDir: false,
  plugins: [copyRuntimeAssets()],
  build: {
    target: 'es2022',
    // Keep generated bundles separate from the runtime asset library.
    assetsDir: '_vite',
  },
  server: {
    open: shouldOpenBrowser,
  },
  preview: {
    open: shouldOpenBrowser,
  },
});
