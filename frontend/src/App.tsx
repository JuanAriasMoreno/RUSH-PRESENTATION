import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './components/Layout';
import { LoadingState, NotFoundState } from './components/ui';
import { AdminPage } from './features/admin/AdminPage';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './features/auth/AuthPages';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LandingPage } from './features/landing/LandingPage';
import { PlayPage } from './features/play/PlayPage';
import { ResultsPage } from './features/play/ResultsPage';
import { ProfilePage, UserProfilePage } from './features/profile/ProfilePages';
import { QuizEditorPage } from './features/quizzes/QuizEditorPage';
import { QuizLibraryPage } from './features/quizzes/QuizLibraryPage';
import { InvitePage } from './features/rooms/InvitePage';
import { RoomDetailPage } from './features/rooms/RoomDetailPage';
import { RoomsPage } from './features/rooms/RoomsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { VocabularyPage } from './features/vocabulary/VocabularyPage';

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && me.accountRole !== 'SUPERADMIN') return <AppLayout><NotFoundState /></AppLayout>;
  return <AppLayout>{children}</AppLayout>;
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return <LoadingState />;
  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/register" element={me ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={me ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />} />
      {/* public landing page */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/rooms" element={<RequireAuth><RoomsPage /></RequireAuth>} />
      <Route path="/rooms/:roomId" element={<RequireAuth><RoomDetailPage /></RequireAuth>} />
      <Route path="/invite/:token" element={<RequireAuth><InvitePage /></RequireAuth>} />
      <Route path="/quizzes" element={<RequireAuth><QuizLibraryPage /></RequireAuth>} />
      <Route path="/quizzes/:quizId" element={<RequireAuth><QuizEditorPage /></RequireAuth>} />
      <Route path="/play/:sessionId" element={<RequireAuth><PlayPage /></RequireAuth>} />
      <Route path="/sessions/:sessionId/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />
      <Route path="/vocabulary" element={<RequireAuth><VocabularyPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/users/:username" element={<RequireAuth><UserProfilePage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
      <Route path="*" element={me ? <AppLayout><NotFoundState /></AppLayout> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define todas las rutas (páginas) de la aplicación y protege las que requieren inicio de
sesión.

Responsabilidades principales:
- Ruta pública "/" (página de inicio) y rutas /login y /register (redirigen a /dashboard si ya hay
  sesión).
- Rutas protegidas dentro de AppLayout: /dashboard, /rooms, /rooms/:roomId, /invite/:token,
  /quizzes, /quizzes/:quizId, /play/:sessionId, /sessions/:sessionId/results, /vocabulary, /profile,
  /users/:username, /settings y /admin.
- RequireAuth: si no hay usuario, redirige a /login?next=<ruta> para volver después de iniciar
  sesión; /admin además exige SUPERADMIN.

Elementos importantes:
- App()
- RequireAuth({ children, admin })

Dependencias:
- react-router-dom
- auth/AuthProvider.tsx
- components/Layout.tsx
- components/ui.tsx
- todas las páginas de features/

Flujo de datos:
Lee el usuario actual del contexto de autenticación y decide qué página mostrar.

Aspectos técnicos importantes:
- La protección en el frontend es solo de experiencia de usuario: el backend vuelve a comprobar los
  permisos en cada petición.

Lugar en la arquitectura:
Capa de navegación del frontend. Mapa de todas las pantallas de RUSH!.
*/
