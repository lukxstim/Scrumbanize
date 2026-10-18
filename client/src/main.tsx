import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import App from './App';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SetupPage from './components/auth/SetupPage';
import { AuthProvider } from './hooks/useAuth';
import { ProjectsProvider } from './hooks/useProjects';
import { ToastProvider } from './hooks/useToast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          {/* Login and setup stand alone; the app with its projects only after logging in (US-21). */}
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="*"
                element={
                  <ProjectsProvider>
                    <App />
                  </ProjectsProvider>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
