import { lazy, Suspense, useEffect, useState } from 'react';
import { useStoredState } from '../../hooks/useStoredState';
import { useTextSelection } from '../../hooks/useTextSelection';
import { needsSourceMode } from '../../utils/highlight';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';

const RichTextEditor = lazy(() => import('./RichTextEditor'));

type Mode = 'rich' | 'source';
const isMode = (value: unknown): value is Mode => value === 'rich' || value === 'source';

interface MarkdownEditorProps {
  /** Markdown. The rich editor reads it when it is created; remount (via `key`) for other content. */
  value: string;
  onChange: (markdown: string) => void;
  /** The selected part as Markdown, or '' when nothing is selected. */
  onSelectionChange?: (markdown: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Minimum height of the writing area, e.g. "min-h-64". */
  minHeightClass?: string;
  /** Viewers (US-21): shown formatted (or as source if it needs that), but not editable. */
  readOnly?: boolean;
}

/**
 * Notes and task descriptions: formatted (WYSIWYG) or as Markdown source. The choice is remembered in the
 * browser. Content the formatted view cannot keep (raw HTML, footnotes) always opens as source.
 */
export default function MarkdownEditor({
  value,
  onChange,
  onSelectionChange,
  label,
  placeholder,
  autoFocus,
  minHeightClass = 'min-h-48',
  readOnly = false,
}: MarkdownEditorProps) {
  const [preferred, setPreferred] = useStoredState<Mode>('scrumbanize.editorMode', 'rich', isMode);
  // Decided when opening, so typing such content in the source view does not switch views under the cursor.
  const [sourceOnly] = useState(() => needsSourceMode(value));
  // Reading is always formatted; the source view is for editing.
  const mode: Mode = sourceOnly ? 'source' : readOnly ? 'rich' : preferred;
  const { selection, textareaHandlers } = useTextSelection();

  useEffect(() => {
    if (mode === 'source') onSelectionChange?.(selection);
  }, [mode, selection, onSelectionChange]);

  const modeSwitch = (
    <SegmentedControl
      label="Ansicht des Editors"
      size="sm"
      value={mode}
      onChange={(next) => {
        onSelectionChange?.('');
        setPreferred(next);
      }}
      options={[
        { value: 'rich', label: 'Formatiert' },
        { value: 'source', label: 'Markdown' },
      ]}
    />
  );

  if (mode === 'rich') {
    return (
      <Suspense fallback={<Skeleton className={`rounded-md ${minHeightClass}`} />}>
        <RichTextEditor
          value={value}
          onChange={onChange}
          onSelectionChange={onSelectionChange}
          label={label}
          placeholder={placeholder}
          autoFocus={autoFocus}
          toolbarTrailing={modeSwitch}
          contentClassName={minHeightClass}
          readOnly={readOnly}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex min-h-9 items-center justify-between gap-2 border-b border-line bg-surface/95 px-1 py-1 backdrop-blur">
        <span className="px-1 text-xs text-fg-subtle">
          {sourceOnly
            ? 'Enthält HTML oder Fußnoten – nur als Markdown bearbeitbar.'
            : 'Markdown-Quelltext'}
        </span>
        {sourceOnly || readOnly ? null : modeSwitch}
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        {...textareaHandlers}
        autoFocus={autoFocus}
        placeholder={placeholder ? `${placeholder} (Markdown)` : 'Markdown …'}
        aria-label={label}
        className={`mt-3 w-full flex-1 resize-y bg-transparent font-mono text-sm leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none ${minHeightClass}`}
      />
    </div>
  );
}
