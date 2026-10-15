import { lazy, Suspense } from 'react';
import Skeleton from '../ui/Skeleton';

// The Markdown renderer is only needed in preview mode, so it loads on first use.
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

export default function LazyMarkdownPreview({ content }: { content: string }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      }
    >
      <MarkdownPreview content={content} />
    </Suspense>
  );
}
