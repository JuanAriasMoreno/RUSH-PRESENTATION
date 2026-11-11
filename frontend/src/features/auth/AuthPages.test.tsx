import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import { I18nProvider } from '../../i18n/I18nProvider';
import { RegisterPage } from './AuthPages';

function renderRegister() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <RegisterPage />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('RegisterPage', () => {
  it('validates on the client before calling the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"code":"unauthorized","message":"x"}}', { status: 401 }));
    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Username'), 'a b');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    const registerCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/register'));
    expect(registerCalls).toHaveLength(0);
  });

  it('shows the server error for a taken username', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/auth/register')
        ? new Response('{"error":{"code":"username_taken","message":"taken"}}', { status: 409 })
        : new Response('{"error":{"code":"unauthorized","message":"x"}}', { status: 401 }),
    );
    renderRegister();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Ana Kim');
    await user.type(screen.getByLabelText('Username'), 'ana');
    await user.type(screen.getByLabelText('Email'), 'ana@example.com');
    await user.type(screen.getByLabelText('Password'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This username is already taken.')).toBeInTheDocument();
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas del formulario de registro.

Responsabilidades principales:
- Valida en el navegador sin llamar a la API cuando los datos son inválidos.
- Muestra el error del servidor cuando el usuario ya existe.

Elementos importantes:
- 2 casos de prueba
- renderRegister()

Dependencias:
- vitest
- @testing-library/react
- @testing-library/user-event
- features/auth/AuthPages.tsx

Flujo de datos:
Simula fetch y la escritura del usuario.

Aspectos técnicos importantes:
- No necesita backend.

Lugar en la arquitectura:
Pruebas automatizadas. Comprueba la validación del registro.
*/
