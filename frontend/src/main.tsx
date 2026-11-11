import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './api/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ConfirmProvider, ToastProvider } from './components/overlays';
import { I18nProvider } from './i18n/I18nProvider';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Es el punto de arranque de la aplicación React: crea la raíz de React y envuelve la
aplicación con todos los proveedores globales.

Responsabilidades principales:
- Crear el QueryClient de TanStack Query (sin reintentos para errores 4xx, sin recarga al enfocar la
  ventana).
- Envolver la aplicación en este orden: QueryClientProvider, BrowserRouter, I18nProvider,
  ToastProvider, ConfirmProvider, AuthProvider.
- Importar los estilos globales (index.css) y montar <App /> en el elemento #root de index.html.

Elementos importantes:
- queryClient
- createRoot(...).render(...)

Dependencias:
- react, react-dom
- @tanstack/react-query
- react-router-dom
- App.tsx
- auth/AuthProvider.tsx
- components/overlays.tsx
- i18n/I18nProvider.tsx
- index.css

Flujo de datos:
No maneja datos de negocio: configura el contexto en el que todos los componentes obtienen datos del
servidor, traducciones y sesión.

Aspectos técnicos importantes:
- StrictMode está activado: en desarrollo React monta los efectos dos veces para detectar errores.

Lugar en la arquitectura:
Raíz del árbol de componentes del frontend. Sin este archivo la interfaz no se renderiza.
*/
