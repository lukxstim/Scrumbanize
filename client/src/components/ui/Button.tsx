import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ' +
  'transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  // Touch screens (US-25): at least 44 px high to tap.
  'pointer-coarse:min-h-11';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg shadow-sm hover:bg-surface-hover',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
  'danger-ghost': 'text-danger-text hover:bg-danger-muted',
};

/** The button classes, also for links and other elements that should look like a button. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({ variant, size, className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
