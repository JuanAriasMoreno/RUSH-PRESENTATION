import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // all test files share one MySQL test database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Configura Vitest para las pruebas del backend.

Responsabilidades principales:
- Entorno node y NODE_ENV=test.
- globalSetup (aplica el esquema) y setupFiles (vacía tablas).
- fileParallelism: false porque todos los archivos comparten la misma base de datos de pruebas.
- Tiempos límite de 30 s por prueba y 60 s por hook.

Elementos importantes:
- defineConfig({...})

Dependencias:
- vitest/config

Flujo de datos:
Lo lee Vitest al ejecutar npm test -w backend.

Aspectos técnicos importantes:
- Ejecutar en serie evita interferencias entre pruebas.

Lugar en la arquitectura:
Infraestructura de pruebas. Determina cómo se ejecutan las 68 pruebas del backend.
*/
