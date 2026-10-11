import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.spec.js',
    timeout: 60000,
    workers: 1,
    outputDir: '.cache/browser-results',
    reporter: [['list']],
    use: {
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        baseURL: 'http://127.0.0.1:5173',
        viewport: { width: 1280, height: 800 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        launchOptions: { args: process.env.PLAYWRIGHT_GPU === 'native'
            ? ['--enable-gpu', '--use-angle=d3d11']
            : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        env: { VITE_NO_OPEN: '1' },
    },
});
