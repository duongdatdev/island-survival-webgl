import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envDir = path.join(rootDir, 'assets', 'environment');

function findAssetFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findAssetFiles(filePath));
        } else if (file.endsWith('.asset.json')) {
            results.push(filePath);
        }
    });
    return results;
}

try {
    const assets = findAssetFiles(envDir).map(filePath => {
        return path.relative(rootDir, filePath).replace(/\\/g, '/');
    });

    const manifest = {
        assets: assets
    };

    fs.writeFileSync(path.join(envDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Generated manifest with ${assets.length} assets.`);
} catch (error) {
    console.error('Error generating manifest:', error);
    process.exit(1);
}
