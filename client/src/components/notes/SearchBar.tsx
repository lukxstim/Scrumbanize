import { SearchIcon } from '../icons';
import { fieldClass } from '../ui/styles';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Also the field's accessible name. */
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Notizen durchsuchen' }: SearchBarProps) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`${placeholder} …`}
        aria-label={placeholder}
        className={`pl-8 ${fieldClass}`}
      />
    </div>
  );
}
