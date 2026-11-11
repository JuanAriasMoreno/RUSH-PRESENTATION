import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { MeDto } from '@rush/shared';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';

interface AuthState {
  me: MeDto | null;
  loading: boolean;
  setMe: (me: MeDto | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  const me = q.data ?? null;
  const value: AuthState = {
    me,
    loading: q.isLoading,
    setMe: (next) => qc.setQueryData(['me'], next),
    logout: async () => {
      await authApi.logout().catch(() => undefined);
      // Keep the (now null) 'me' query mounted; drop every other cached response of the old user.
      // (qc.clear() would leave the mounted observer holding the previous user.)
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

/** For pages rendered only when logged in. */
export function useMe(): MeDto {
  const { me } = useAuth();
  if (!me) throw new Error('not authenticated');
  return me;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Proporciona a toda la aplicación el usuario actual y las acciones de sesión.

Responsabilidades principales:
- Consultar GET /api/auth/me con useQuery (una respuesta 401 significa "sin sesión").
- setMe para actualizar el usuario tras iniciar sesión o editar el perfil.
- logout: llama a POST /api/auth/logout y borra los datos en caché del usuario anterior.

Elementos importantes:
- AuthProvider
- useAuth()
- useMe()

Dependencias:
- @tanstack/react-query
- api/endpoints.ts (authApi)
- api/client.ts

Flujo de datos:
El estado de sesión vive en el servidor (cookie HttpOnly); aquí solo se guarda en caché el resultado
de /auth/me.

Aspectos técnicos importantes:
- El frontend nunca ve la cookie ni la contraseña; solo el perfil devuelto por el backend.

Lugar en la arquitectura:
Capa de estado global del frontend. Permite que cualquier página sepa quién ha iniciado sesión.
*/
