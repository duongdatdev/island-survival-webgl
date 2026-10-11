import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';

// Freeze source, browser stories and runtime assets so normal development cannot HMR a running test.
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const port = Number(process.env.SNAPSHOT_PORT || 4179);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SNAPSHOT_PORT must be an integer between 1024 and 65535');
const baseURL = `http://127.0.0.1:${port}`;
const directory = resolve('.cache/browser-snapshots', runId), root = join(directory, 'app');
await mkdir(root, { recursive: true });
for (const path of ['src', 'tools', 'tests/browser', 'tests/fixtures', 'index.html', 'index.css', 'campaign.css', 'package.json', 'vite.config.js']) {
    await cp(resolve(path), join(root, path), { recursive: true });
}
await cp(resolve('dist/assets'), join(root, 'assets'), { recursive: true });
// Production fonts are hashed into _vite; source CSS still needs the raw font directory.
await cp(resolve('assets/fonts'), join(root, 'assets/fonts'), { recursive: true });
// Vite's HTML dev entry references source; bundled production links are not copied over it.
const hash = createHash('sha256');
async function hashTree(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) await hashTree(join(path, entry.name), name + '/');
        else { hash.update(name); hash.update(await readFile(join(path, entry.name))); }
    }
}
await hashTree(root);
const report = { status: 'starting', pid: process.pid, root, sourceAndRuntimeSHA256: hash.digest('hex'),
    selectedPatterns: process.argv.slice(2), baseURL,
    startedAt: new Date().toISOString(), scope: 'Frozen source, browser stories and runtime assets; native Chrome dev-server regression. Dependencies resolve from the existing workspace installation. No current worktree HMR changes can affect this run.' };
const reportPath = join(directory, 'report.json'), configPath = join(root, 'snapshot-playwright.config.mjs');
const command = `"${process.execPath}" "${resolve('node_modules/vite/bin/vite.js')}" --host 127.0.0.1 --port ${port} --strictPort`;
await writeFile(configPath, `import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: ${JSON.stringify(join(root, 'tests/browser'))}, testMatch: '**/*.spec.js', timeout: 60000, workers: 1,
 outputDir: ${JSON.stringify(join(directory, 'results'))}, reporter: [['line']],
 use: { channel: 'chrome', baseURL: ${JSON.stringify(baseURL)}, viewport: { width: 1280, height: 800 },
  screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--enable-gpu', '--use-angle=d3d11'] } },
 webServer: { command: ${JSON.stringify(command)}, cwd: ${JSON.stringify(root)},
  url: ${JSON.stringify(baseURL)}, reuseExistingServer: false, env: { VITE_NO_OPEN: '1' } }
});
`);
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: reportPath, status: report.status }));
const child = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', configPath, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
report.childPid = child.pid; report.status = 'running'; await writeFile(reportPath, JSON.stringify(report, null, 2));
const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
report.status = code === 0 ? 'passed' : 'failed'; report.exitCode = code; report.finishedAt = new Date().toISOString();
await writeFile(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ report: reportPath, status: report.status }));
process.exitCode = code ?? 1;
