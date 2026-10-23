import { Link } from 'react-router';
import { ChevronLeftIcon } from '../icons';

/** Phones (US-25) show either a list or what was opened from it; this bar leads back to the list. Hidden from md on. */
export default function MobileBackLink({ to, label }: { to: string; label: string }) {
  return (
    <div className="flex shrink-0 items-center border-b border-line px-1 md:hidden">
      <Link
        to={to}
        className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronLeftIcon className="size-5" />
        {label}
      </Link>
    </div>
  );
}
