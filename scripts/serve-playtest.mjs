import { preview } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Keep a player's origin and build stable while development continues elsewhere.
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('.cache/playtest', runId), buildDirectory = resolve(directory, 'dist');
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), buildDirectory, { recursive: true });
const html = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
const bundle = html.match(/(?:src=")[^"]*\/(index-[^"/]+\.js)"/)?.[1];
if (!bundle) throw new Error('Cannot identify production bundle');
const metadata = { status: 'starting', pid: process.pid, createdAt: new Date().toISOString(), directory, buildDirectory,
    bundle, bundleSHA256: createHash('sha256').update(await readFile(resolve(buildDirectory, '_vite', bundle))).digest('hex'),
    indexSHA256: createHash('sha256').update(html).digest('hex'), url: 'http://127.0.0.1:4173/',
    purpose: 'P01 first human Campaign playtest; immutable production copy. User volunteered to test first; no human session or duration result recorded yet.' };
await cp(resolve('tasks/player-guide.vi.md'), resolve(directory, 'HUONG-DAN.vi.md'));
await cp(resolve('tasks/playtest-protocol.vi.md'), resolve(directory, 'NHAT-KY-CHOI-THU.vi.md'));
const save = async () => {
    const json = JSON.stringify(metadata, null, 2);
    await writeFile(resolve(directory, 'build.json'), json);
    await writeFile(resolve('.cache/playtest/current.json'), json);
};
await save();
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: buildDirectory },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, open: false } });
metadata.status = 'serving'; await save(); console.log(JSON.stringify(metadata));
const close = async () => {
    await new Promise(resolve => server.httpServer.close(resolve)); metadata.status = 'stopped'; await save(); process.exit(0);
};
process.on('SIGINT', close); process.on('SIGTERM', close);
