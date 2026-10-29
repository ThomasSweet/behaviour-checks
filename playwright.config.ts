import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const site = process.env.SITE_DIR
const firefoxHome = process.platform === 'darwin' ? join(tmpdir(), 'playwright-firefox-home') : null
if (firefoxHome) mkdirSync(firefoxHome, { recursive: true })

export default defineConfig({
  testDir: 'tests',
  testIgnore: 'consumer/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'reports/last-run.json' }]],
  use: {
    baseURL: 'http://localhost:4310',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: firefoxHome ? { env: { ...process.env, CFFIXED_USER_HOME: firefoxHome } } : {},
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'node tests/serve.mjs',
      url: 'http://localhost:4310/expanded-state/pass.html',
      reuseExistingServer: !process.env.CI,
    },
    ...(site
      ? [
          {
            command: 'npm run preview -- --port 4173 --strictPort',
            cwd: site,
            url: 'http://localhost:4173',
            reuseExistingServer: true,
          },
        ]
      : []),
  ],
})
