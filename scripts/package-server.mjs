import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist-server');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(resolve(output, '.server-package-'));
const modules = new Set();

async function copyModule(path) {
    const name = relative(root, path);
    if (name === '..' || name.startsWith('..' + sep)) throw new Error('Server module must stay inside the project: ' + path);
    if (modules.has(name)) return;
    modules.add(name);
    const source = await readFile(path, 'utf8');
    const destination = resolve(staging, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source);
    // The server graph uses static ES imports. Copy only its transitive modules, never game assets or saves.
    const imports = source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"`]*?\sfrom\s*)?['"]([^'"]+)['"]/gm);
    for (const [, specifier] of imports) {
        if (specifier.startsWith('.')) await copyModule(resolve(dirname(path), specifier));
        else if (specifier !== 'ws' && !specifier.startsWith('node:')) throw new Error('Unpackaged server dependency: ' + specifier);
    }
}

try {
    await copyModule(resolve(root, 'server/index.js'));
    const manifest = JSON.parse(await readFile(resolve(root, 'server/package.json'), 'utf8'));
    manifest.scripts = { start: 'node server/index.js' };
    manifest.files = [...modules].map(path => path.split(sep).join('/')).concat(['README.md', 'start-server.cmd', 'start-server.sh', 'npm-shrinkwrap.json']);
    await writeFile(resolve(staging, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const [source, target] of [['package-lock.json', 'package-lock.json'], ['README.md', 'README.md'],
        ['start-server.cmd', 'start-server.cmd'], ['start-server.sh', 'start-server.sh']]) {
        await copyFile(resolve(root, 'server', source), resolve(staging, target));
    }
    // npm pack omits package-lock.json. Ship npm-shrinkwrap.json so npm ci is reproducible after extraction.
    await copyFile(resolve(staging, 'package-lock.json'), resolve(staging, 'npm-shrinkwrap.json'));
    if (!process.env.npm_execpath) throw new Error('Run this script with npm run build:server.');
    const { stdout } = await promisify(execFile)(process.execPath,
        [process.env.npm_execpath, 'pack', staging, '--pack-destination', output, '--ignore-scripts', '--json'],
        { cwd: root, maxBuffer: 1024 * 1024 });
    const [archive] = JSON.parse(stdout);
    if (!archive.files.some(file => file.path === 'npm-shrinkwrap.json')) throw new Error('Dedicated-server archive is missing its dependency lock.');
    console.log(`Dedicated Server: ${resolve(output, archive.filename)}`);
    console.log(`${modules.size} runtime modules; no client build, graphics, assets or world saves included.`);
} finally {
    const absoluteStaging = resolve(staging);
    if (!absoluteStaging.startsWith(output + sep)) throw new Error('Refusing to remove a staging directory outside dist-server.');
    await rm(absoluteStaging, { recursive: true, force: true });
}
