export * from './limits';
export * from './questions';
export * from './schemas';
export * from './types';
export * from './scoring';

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Reexporta todo el paquete compartido @rush/shared para importarlo con una sola ruta.

Responsabilidades principales:
- Exportar limits, questions, schemas, types y scoring.

Elementos importantes:
- export * from ...

Dependencias:
- shared/src/*.ts

Flujo de datos:
Backend y frontend importan "@rush/shared", que apunta a este archivo.

Aspectos técnicos importantes:
- Es un paquete de npm workspaces que se consume como código TypeScript.

Lugar en la arquitectura:
Capa compartida. Punto único de acceso al código común.
*/
