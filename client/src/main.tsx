import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { ProjectsProvider } from './hooks/useProjects';
import { ToastProvider } from './hooks/useToast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ProjectsProvider>
          <App />
        </ProjectsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
