/** Text inputs, text areas and selects. */
export const fieldClass =
  'block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg shadow-sm ' +
  'placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20';

/** Labels above fields. */
export const labelClass = 'block text-sm font-medium text-fg-muted';

/** Icon-only buttons (menus, close, collapse). */
export const iconButtonClass =
  'grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors duration-150 ' +
  'hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent';

/** Popovers and menus: surface, border, shadow and the pop-in animation. */
export const popoverClass = 'rounded-lg border border-line bg-surface py-1 shadow-popover animate-pop-in';

/** Items inside a menu. */
export const menuItemClass =
  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-fg-muted transition-colors duration-100 ' +
  'hover:bg-surface-hover hover:text-fg focus:bg-surface-hover focus:text-fg focus:outline-none';
