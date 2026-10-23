/** Text inputs, text areas and selects. */
export const fieldClass =
  'block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg shadow-sm ' +
  'placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20';

/** Labels above fields. */
export const labelClass = 'block text-sm font-medium text-fg-muted';

/**
 * Touch screens (US-25): at least 44 × 44 px to tap, as Apple and Google recommend. Only for coarse pointers, so
 * the layout with a mouse stays as it is.
 */
export const touchTargetClass = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';

/**
 * For small controls where a 44 px box would break the layout (on cards, in headers, on thumbnails): an invisible
 * area around them takes the tap instead, at least 44 × 44 px on touch screens (US-25). Needs a positioned control
 * (absolute or relative); touchHitAreaClass makes it relative.
 */
export const touchHitAreaBeforeClass =
  "pointer-coarse:before:absolute pointer-coarse:before:top-1/2 pointer-coarse:before:left-1/2 pointer-coarse:before:size-11 " +
  "pointer-coarse:before:-translate-1/2 pointer-coarse:before:content-['']";

export const touchHitAreaClass = `relative ${touchHitAreaBeforeClass}`;

/** Icon-only buttons (menus, close, collapse). */
export const iconButtonClass =
  'grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors duration-150 ' +
  'hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent ' +
  touchTargetClass;

/** Popovers and menus: surface, border, shadow and the pop-in animation. */
export const popoverClass = 'rounded-lg border border-line bg-surface py-1 shadow-popover animate-pop-in';

/** Items inside a menu. */
export const menuItemClass =
  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-fg-muted transition-colors duration-100 ' +
  'hover:bg-surface-hover hover:text-fg focus:bg-surface-hover focus:text-fg focus:outline-none pointer-coarse:min-h-11';

/**
 * The heading of a dialog with padding p-6. On phones, where the dialog fills the screen (US-25), it stays at the
 * top while the dialog scrolls.
 */
export const dialogTitleClass =
  'text-base font-semibold text-fg max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-6 max-sm:-mt-6 max-sm:mb-2 ' +
  'max-sm:border-b max-sm:border-line max-sm:bg-surface max-sm:px-6 max-sm:py-4';

/** The bar of buttons at the end of a dialog with padding p-6 stays at the bottom on phones, while the dialog scrolls. */
export const stickyDialogActionsClass =
  'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-6 max-sm:-mb-6 max-sm:border-t max-sm:border-line max-sm:bg-surface ' +
  'max-sm:px-6 max-sm:py-3';

/** The usual buttons at the end of a dialog with padding p-6, right-aligned. */
export const dialogActionsClass = `mt-6 flex justify-end gap-2 ${stickyDialogActionsClass}`;
