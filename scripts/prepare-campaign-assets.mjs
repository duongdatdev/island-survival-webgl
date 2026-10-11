import { NodeIO } from '@gltf-transform/core';
import { brotliDecompressSync } from 'node:zlib';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ModelAsset } from '../src/renderer/ModelAsset.js';

const directory = resolve('assets/campaign/models');
const rodPath = resolve(directory, 'quaternius_fishing_rod.glb');
try { await readFile(rodPath); }
catch {
    const response = await fetch('https://static.poly.pizza/10b55863-caee-4ac6-8a53-f9991acb30bb.glb.br');
    if (!response.ok) throw new Error(`Fishing rod: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(rodPath, bytes.subarray(0, 4).toString() === 'glTF' ? bytes : brotliDecompressSync(bytes));
}

const sourceRecord = JSON.parse(await readFile('assets/campaign/sources.json', 'utf8'));
const sourceById = new Map(sourceRecord.packs.flatMap(pack => pack.models.map(model => [model.id, pack])));
const heightOverrides = {
    survival_workbench: 1.05, 'survival_workbench-anvil': 1.0, 'survival_workbench-grind': 1.05,
    survival_bedroll: 0.12, 'survival_bedroll-frame': 0.45, survival_chest: 0.7,
    'survival_box-large': 0.8, survival_barrel: 1.0,
    'pirate_ship-wreck': 5.0, 'pirate_boat-row-small': 0.7,
    'pirate_structure-platform-dock': 0.7, 'pirate_structure-platform-dock-small': 0.7,
    'pirate_tower-watch': 5.0, pirate_crate: 0.8, pirate_mast: 4,
    'pirate_mast-ropes': 4, 'pirate_platform-planks': 0.16,
    quaternius_fishing_rod: 1.4,
};
const io = new NodeIO();
const models = [];
for (const file of (await readdir(directory)).filter(file => file.endsWith('.glb')).sort()) {
    const document = await io.read(resolve(directory, file));
    const root = document.getRoot();
    const primitives = root.listNodes().flatMap(node => (node.getMesh()?.listPrimitives() || [])
        .map(primitive => ({ primitive, nodeMatrix: node.getWorldMatrix() })));
    if (!primitives.length) throw new Error(`${file} contains no geometry`);
    const bounds = ModelAsset._computeWorldBounds(primitives);
    const size = bounds.max.map((value, axis) => value - bounds.min[axis]);
    if (!size.every(value => Number.isFinite(value) && value >= 0) || !size.some(value => value > 0)) throw new Error(`${file} has invalid bounds`);
    const id = file.slice(0, -4);
    // Building/cave packs are already measured in metres. Fitting a 10 cm floor
    // to wall height would turn one 2 m tile into a 48 m platform.
    const nativeScale = id.startsWith('campaign_') || id.startsWith('cave_') || id.startsWith('building_');
    let height = heightOverrides[id];
    if (height === undefined) {
        height = id.startsWith('cave_') ? size[1] : id.startsWith('building_') ? 2.4
            : /tool-/.test(id) ? 0.7 : id.startsWith('food_') ? 0.25 : size[1];
    }
    const scale = nativeScale ? 1 : height / size[1];
    const pack = sourceById.get(id);
    const isCrop = id.startsWith('campaign_crop_');
    const isReused = /^campaign_(radio|battery|compass|tent|torch|raft)$/.test(id);
    models.push({
        id, path: `assets/campaign/models/${file}`, nativeScale,
        targetSize: size.map(value => Math.max(0.0001, Number((value * scale).toFixed(5)))),
        sourceBounds: bounds, triangles: primitives.reduce((sum, entry) => sum
            + (entry.primitive.getIndices()?.getCount() || entry.primitive.getAttribute('POSITION').getCount()) / 3, 0),
        drawables: primitives.length, animations: root.listAnimations().map(animation => animation.getName()),
        license: pack || isCrop || isReused || id === 'quaternius_fishing_rod' ? 'CC0-1.0' : 'Project-owned',
        source: pack?.source || (isCrop ? 'https://quaternius.com/packs/ultimatecrops.html'
            : isReused ? 'assets/survival-pack/SurvivalPack/License.txt'
                : id === 'quaternius_fishing_rod' ? 'https://poly.pizza/m/skqPvEIpve'
                    : id.startsWith('campaign_raft_') ? 'scripts/build-raft-equipment.py' : 'scripts/build-campaign-models.py'),
    });
}

await writeFile('assets/campaign/licenses/fishing-rod.txt',
    'Fishing Rod by Quaternius\nSource: https://poly.pizza/m/skqPvEIpve\nPublic Domain (CC0)\nhttps://creativecommons.org/publicdomain/zero/1.0/\nVerified 2026-10-06.\n');
const licenses = sourceRecord.packs.map(pack => pack.licensePath);
licenses.push('assets/campaign/licenses/fishing-rod.txt', 'assets/survival-pack/SurvivalPack/License.txt');
await writeFile('assets/campaign/manifest.json', JSON.stringify({ version: 1, models, licenses }, null, 2) + '\n');
const credits = sourceRecord.packs.map(pack => `- ${pack.author}: [${pack.pack}](${pack.source}), CC0-1.0.`);
await writeFile('assets/campaign/CREDITS.md', '# Campaign model sources\n\n'
    + credits.join('\n') + '\n- Quaternius: [Fishing Rod](https://poly.pizza/m/skqPvEIpve), CC0-1.0.\n'
    + '- Reused Quaternius Survival Pack props: see the original included License.txt.\n'
    + '- Bespoke campaign props: authored for this project in Blender; editable source and rebuild script included.\n'
    + '\nOnly models in manifest.json are shipped. Original archives are cached outside the production payload.\n');
console.log(`Prepared ${models.length} verified models; ${models.reduce((sum, model) => sum + model.triangles, 0)} triangles total in the library.`);
