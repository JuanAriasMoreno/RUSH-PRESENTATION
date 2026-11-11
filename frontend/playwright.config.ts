import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: real browser → Vite (5174) → API (4100) → MySQL database "rush_e2e" (reset on start).
 * Requires the MySQL server from `npm run db:up`. Translation runs in mock mode; emails go to the console.
 */
const API_PORT = 4100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:server -w backend',
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        APP_URL: `http://localhost:${WEB_PORT}`,
        PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        NODE_ENV: 'development',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Configura Playwright: arranca un backend (puerto 4100, base de datos _e2e) y un frontend
(puerto 5174) exclusivos para las pruebas.

Responsabilidades principales:
- Un solo trabajador y tiempo límite de 90 s por prueba.
- webServer: npm run e2e:server -w backend y vite --port 5174.
- PW_CHANNEL permite usar el Chrome instalado.

Elementos importantes:
- defineConfig({...})

Dependencias:
- @playwright/test

Flujo de datos:
Lo lee Playwright al ejecutar npm run test:e2e.

Aspectos técnicos importantes:
- Las pruebas no usan los puertos ni la base de datos de desarrollo.

Lugar en la arquitectura:
Infraestructura de pruebas. Hace reproducibles las pruebas de extremo a extremo.
*/
