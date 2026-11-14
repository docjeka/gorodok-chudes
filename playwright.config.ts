import { defineConfig } from '@playwright/test';

// Браузерные сценарии идут против production-сборки. Это настольный Chrome с эмуляцией экрана планшета, а не настоящий iPad.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 150_000,
  workers: 1, // программный WebGL медленный: параллельные браузеры мешают друг другу
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    viewport: { width: 1600, height: 900 },
    launchOptions: { executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4173/', reuseExistingServer: true, timeout: 60_000 },
});
