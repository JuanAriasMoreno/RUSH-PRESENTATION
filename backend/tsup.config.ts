import { defineConfig } from 'tsup';

// Production bundle of the API. The shared workspace (TypeScript source) is bundled in.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: ['@rush/shared'],
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Configura tsup para generar el paquete de producción del backend en backend/dist.

Responsabilidades principales:
- Punto de entrada src/index.ts, formato ESM, destino Node 20.
- noExternal: incluye el código de @rush/shared dentro del paquete.
- clean: vacía dist antes de compilar.

Elementos importantes:
- defineConfig({...})

Dependencias:
- tsup

Flujo de datos:
Lo usa npm run build -w backend; genera dist/index.js, que ejecuta npm start.

Aspectos técnicos importantes:
- El paquete compartido se publica como código TypeScript, por eso debe empaquetarse.

Lugar en la arquitectura:
Herramienta de compilación. Permite ejecutar el backend sin tsx en producción.
*/
