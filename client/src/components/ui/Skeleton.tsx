/** A pulsing placeholder shape while content loads. Size and shape come from `className`. */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-strong ${className}`} />;
}
