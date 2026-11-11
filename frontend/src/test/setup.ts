import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Configura las pruebas del frontend: añade los comparadores de jest-dom y limpia el DOM
después de cada prueba.

Responsabilidades principales:
- Importar @testing-library/jest-dom/vitest.
- afterEach(cleanup).

Elementos importantes:
- cleanup

Dependencias:
- @testing-library/jest-dom
- @testing-library/react
- vitest

Flujo de datos:
Lo carga Vitest según vite.config.ts.

Aspectos técnicos importantes:
- Evita que una prueba vea elementos de otra.

Lugar en la arquitectura:
Infraestructura de pruebas. Necesario para las pruebas de componentes.
*/
