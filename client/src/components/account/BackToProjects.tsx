import { Link } from 'react-router';
import { ChevronLeftIcon } from '../icons';

/** Profile and user management sit outside the projects (US-21c); this leads back to the last project used. */
export default function BackToProjects() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-fg-subtle hover:text-fg">
      <ChevronLeftIcon className="size-4" />
      Zurück zu den Projekten
    </Link>
  );
}
