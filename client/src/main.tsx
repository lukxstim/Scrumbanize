import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import App from './App';
import { InvitePage, ResetPage } from './components/auth/LinkPages';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SetupPage from './components/auth/SetupPage';
import UpdatePrompt from './components/UpdatePrompt';
import { AuthProvider } from './hooks/useAuth';
import { ProjectsProvider } from './hooks/useProjects';
import { RealtimeProvider } from './hooks/useRealtime';
import { ToastProvider } from './hooks/useToast';
import './index.css';

// The page of a sticky note window of the desktop app (US-26), loaded only there.
const StickyNotePage = lazy(() => import('./components/sticky/StickyNotePage'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        {/* New versions of the installable web app (US-25), also on the login page. */}
        <UpdatePrompt />
        <AuthProvider>
          {/* Login and setup stand alone; the app with its projects only after logging in (US-21). */}
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/einladung/:token" element={<InvitePage />} />
            <Route path="/passwort/:token" element={<ResetPage />} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/sticky/:noteId"
                element={
                  <RealtimeProvider>
                    <Suspense fallback={null}>
                      <StickyNotePage />
                    </Suspense>
                  </RealtimeProvider>
                }
              />
              <Route
                path="*"
                element={
                  // Live updates (US-24) only for logged-in pages.
                  <RealtimeProvider>
                    <ProjectsProvider>
                      <App />
                    </ProjectsProvider>
                  </RealtimeProvider>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
