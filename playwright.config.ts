import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4173/StudyOS/',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ?? (process.env.CI ? undefined : '/usr/bin/chromium'),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/StudyOS/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
