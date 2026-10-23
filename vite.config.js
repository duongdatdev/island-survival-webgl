import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';

const shouldOpenBrowser = process.env.VITE_NO_OPEN !== '1';
const GLTF_BROWSER_SHIM_PREFIX = '\0gltf-transform-browser-shim:';

/**
 * @gltf-transform/core exports WebIO and NodeIO from the same entry point.
 * Rolldown sees NodeIO's dynamic node:fs/node:path imports even though the game
 * only instantiates WebIO. Resolve those two imports to an explicit browser
 * guard so they cannot leak Node built-ins or produce misleading build warnings.
 */
function isolateGltfNodeBuiltins() {
  return {
    name: 'isolate-gltf-node-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      const isNodeBuiltin = source === 'node:fs' || source === 'node:path';
      const isGltfCore = importer && /@gltf-transform[\\/]core[\\/]dist[\\/]index\.js$/.test(importer);
      return isNodeBuiltin && isGltfCore ? `${GLTF_BROWSER_SHIM_PREFIX}${source}` : null;
    },
    load(id) {
      if (!id.startsWith(GLTF_BROWSER_SHIM_PREFIX)) return null;
      return `
        const unavailable = () => {
          throw new Error('NodeIO is unavailable in the browser build. Use WebIO instead.');
        };
        export const promises = new Proxy({}, { get: () => unavailable });
        export { unavailable as resolve, unavailable as dirname, unavailable as basename };
      `;
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

function addRuntimeAsset(files, path) {
  const source = resolve(path);
  const assetsRoot = resolve('assets');
  const assetRelativePath = relative(assetsRoot, source);

  if (assetRelativePath.startsWith('..') || resolve(assetsRoot, assetRelativePath) !== source) {
    throw new Error(`Runtime asset must stay inside assets/: ${path}`);
  }

  files.add(source);
}

async function collectRuntimeAssets() {
  const files = new Set();

  const audioManifestPath = 'assets/audio/manifest.json';
  addRuntimeAsset(files, audioManifestPath);
  const audioManifest = await readJson(audioManifestPath);
  for (const clip of Object.values(audioManifest.clips)) {
    for (const file of clip.files) addRuntimeAsset(files, file.path);
  }
  for (const license of audioManifest.licenses) addRuntimeAsset(files, license);

  const environmentManifestPath = 'assets/environment/manifest.json';
  addRuntimeAsset(files, environmentManifestPath);
  const environmentManifest = await readJson(environmentManifestPath);
  for (const metadataPath of environmentManifest.assets || []) {
    addRuntimeAsset(files, metadataPath);
    addRuntimeAsset(files, metadataPath.replace(/\.asset\.json$/, '.obj'));
  }
  addRuntimeAsset(files, 'assets/environment/chest.glb');

  const creatureManifestPath = 'assets/creatures/manifest.json';
  addRuntimeAsset(files, creatureManifestPath);
  const creatureManifest = await readJson(creatureManifestPath);
  for (const model of creatureManifest.models || []) addRuntimeAsset(files, model.path);

  const survivalManifestPath = 'assets/survival-pack/survival-items.json';
  addRuntimeAsset(files, survivalManifestPath);
  const survivalManifest = await readJson(survivalManifestPath);
  for (const item of survivalManifest.items || []) {
    addRuntimeAsset(files, item.objPath);
    addRuntimeAsset(files, item.mtlPath);
  }

  const campaignManifestPath = 'assets/campaign/manifest.json';
  addRuntimeAsset(files, campaignManifestPath);
  const campaignManifest = await readJson(campaignManifestPath);
  for (const model of campaignManifest.models || []) addRuntimeAsset(files, model.path);
  for (const license of campaignManifest.licenses || []) addRuntimeAsset(files, license);
  addRuntimeAsset(files, 'assets/fonts/OFL-Cinzel.txt');
  addRuntimeAsset(files, 'assets/fonts/OFL-BarlowCondensed.txt');

  // The current player renderer uses one fixed character. Keep this explicit so
  // adding character selection also requires updating the production payload.
  addRuntimeAsset(files, 'assets/Ultimate Animated Character Pack - Nov 2019/OBJ/Casual_Male.obj');
  addRuntimeAsset(files, 'assets/Ultimate Animated Character Pack - Nov 2019/OBJ/Casual_Male.mtl');

  return files;
}

/**
 * Runtime models and manifests are fetched by URL, so Vite cannot discover
 * them from the module graph. Copy only referenced game assets; source textures,
 * Blender/FBX files and unused character variants must not ship to players.
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
      const assetsRoot = resolve('assets');
      const files = await collectRuntimeAssets();

      await Promise.all(Array.from(files, async source => {
        const destination = resolve(outputDirectory, 'assets', relative(assetsRoot, source));
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(source, destination);
      }));
    },
  };
}

export default defineConfig({
  // Relative bundle URLs also support deployment below a domain subdirectory.
  base: './',
  publicDir: false,
  plugins: [isolateGltfNodeBuiltins(), copyRuntimeAssets()],
  build: {
    target: 'es2022',
    // Keep generated bundles separate from the runtime asset library.
    assetsDir: '_vite',
  },
  server: {
    host: '0.0.0.0',
    open: shouldOpenBrowser,
    // Browser traces and isolated QA builds are generated continuously during verification.
    watch: { ignored: ['**/.cache/**', '**/dist-server/**', '**/server-data/**'] },
  },
  preview: {
    host: '0.0.0.0',
    open: shouldOpenBrowser,
  },
});
