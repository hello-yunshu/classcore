import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    reporter: process.env.CI ? [['line']] : [['list']],
    use: {
        baseURL: process.env.CLASSCORE_PRESENTATION_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
});

