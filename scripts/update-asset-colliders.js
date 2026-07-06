const fs = require('fs');
const path = require('path');

const COLLIDER_MAP = {
    Tree:   { type: 'capsule', trigger: false, layer: 'Environment', radius: 0.6, height: 2.0 },
    Palm:   { type: 'capsule', trigger: false, layer: 'Environment', radius: 0.5, height: 2.5 },
    Rock:   { type: 'box',     trigger: false, layer: 'Environment', halfExtents: [0.9, 0.6, 0.9] },
    Bush:   { type: 'sphere',  trigger: true,  layer: 'Trigger',     radius: 0.4 },
    Grass:  { type: 'none',    trigger: false, layer: 'Environment' },
    Flower: { type: 'none',    trigger: false, layer: 'Environment' },
    Plant:  { type: 'none',    trigger: false, layer: 'Environment' },
    Unknown:{ type: 'none',    trigger: false, layer: 'Environment' },
};

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'environment', 'OBJ');

function inferCollider(category) {
    return COLLIDER_MAP[category] || COLLIDER_MAP.Unknown;
}

function hasCollider(asset) {
    return asset.collider && typeof asset.collider === 'object';
}

function update() {
    const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.asset.json'));
    let updated = 0;
    let skipped = 0;

    for (const file of files) {
        const filePath = path.join(ASSETS_DIR, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const asset = JSON.parse(raw);

        if (hasCollider(asset)) {
            skipped++;
            continue;
        }

        const category = asset.category || 'Unknown';
        const colliderDef = inferCollider(category);

        const collider = { type: colliderDef.type, trigger: colliderDef.trigger, layer: colliderDef.layer };

        if (colliderDef.radius !== undefined) collider.radius = colliderDef.radius;
        if (colliderDef.height !== undefined) collider.height = colliderDef.height;
        if (colliderDef.halfExtents !== undefined) collider.halfExtents = colliderDef.halfExtents;

        asset.collider = collider;

        const output = JSON.stringify(asset, null, 2) + '\n';
        fs.writeFileSync(filePath, output, 'utf-8');
        updated++;
    }

    console.log(`Updated ${updated} asset files, skipped ${skipped} (already have collider).`);
}

update();
