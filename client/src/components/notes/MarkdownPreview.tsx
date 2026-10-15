import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// react-markdown does not render raw HTML and strips unsafe URLs (e.g. javascript:), so note content cannot inject scripts.
export default function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm italic text-slate-400">Noch kein Inhalt.</p>;
  }

  return (
    <div className="prose prose-slate max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
