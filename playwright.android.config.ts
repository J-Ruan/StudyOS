import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/android-web',
  outputDir: 'test-results/android',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:4175/',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ?? (process.env.CI ? undefined : '/usr/bin/chromium'),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4175 --outDir dist-android',
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/StudyOS/',
      reuseExistingServer: !process.env.CI,
    },
  ],
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
});
