import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { protectedRedirect } from '../../utils/auth';
import Skeleton from '../ui/Skeleton';

/** The app itself: shown once someone is logged in (or there is no login), else setup or login (US-21). */
export default function ProtectedRoute() {
  const { status, session, reload } = useAuth();
  const location = useLocation();

  if (status === 'error') {
    return (
      <div className="p-6 text-sm text-danger-text">
        <p>Scrumbanize ist gerade nicht erreichbar.</p>
        <button type="button" className="mt-2 underline" onClick={() => void reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="space-y-3 p-6" aria-label="Lade …">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
    );
  }

  const redirect = protectedRedirect(session, `${location.pathname}${location.search}`);
  return redirect ? <Navigate to={redirect} replace /> : <Outlet />;
}
