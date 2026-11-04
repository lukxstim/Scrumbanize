import { useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../utils/highlight';
import { modKey } from '../ui/Kbd';
import { fieldClass, popoverClass } from '../ui/styles';
import { alignColumns, columnAlign, inHeaderRow, type ColumnAlign } from './extensions';

const buttonClass = (active: boolean) =>
  `grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
    active ? 'bg-accent-muted text-accent-text' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
  }`;

export function ToolButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keep the editor's selection when a button is clicked.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={buttonClass(active)}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />;

/** Formatting buttons above the editor: block type, marks, highlight colors, lists, quote, code, link, undo. */
export default function EditorToolbar({ editor, trailing }: { editor: Editor; trailing?: ReactNode }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: ([1, 2, 3] as const).find((level) => e.isActive('heading', { level })) ?? 0,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as HighlightColor | undefined) ?? 'yellow') : null,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canInsertTable: e.can().insertTable(),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [colorsOpen, setColorsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const chain = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div role="toolbar" aria-label="Formatierung" className="flex flex-wrap items-center gap-0.5 px-1 py-1">
        <select
          aria-label="Textformat"
          value={state.heading}
          onChange={(event) => {
            const level = Number(event.target.value) as 0 | 1 | 2 | 3;
            if (level === 0) chain().setParagraph().run();
            else chain().setHeading({ level }).run();
          }}
          className={`!h-7 !w-auto !py-0 !pl-2 !text-xs ${fieldClass}`}
        >
          <option value={0}>Text</option>
          <option value={1}>Überschrift 1</option>
          <option value={2}>Überschrift 2</option>
          <option value={3}>Überschrift 3</option>
        </select>
        <Divider />
        <ToolButton label="Fett" shortcut={`${modKey}+B`} active={state.bold} onClick={() => chain().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton label="Kursiv" shortcut={`${modKey}+I`} active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <span className="font-serif italic">I</span>
        </ToolButton>
        <ToolButton label="Durchgestrichen" shortcut={`${modKey}+Shift+S`} active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <span className="line-through">S</span>
        </ToolButton>
        <ToolButton label="Code" shortcut={`${modKey}+E`} active={state.code} onClick={() => chain().toggleCode().run()}>
          <span className="font-mono text-xs">{'</>'}</span>
        </ToolButton>
        <HighlightPicker
          active={state.highlight}
          open={colorsOpen}
          onOpenChange={setColorsOpen}
          onPick={(color) => {
            if (color) chain().setHighlight({ color }).run();
            else chain().unsetHighlight().run();
            setColorsOpen(false);
          }}
        />
        <Divider />
        <ToolButton label="Aufzählung" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
          <ListGlyph kind="bullet" />
        </ToolButton>
        <ToolButton label="Nummerierte Liste" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
          <ListGlyph kind="ordered" />
        </ToolButton>
        <ToolButton label="Checkliste" active={state.taskList} onClick={() => chain().toggleTaskList().run()}>
          <ListGlyph kind="task" />
        </ToolButton>
        <ToolButton label="Zitat" active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
          <span className="font-serif text-base leading-none">„</span>
        </ToolButton>
        <ToolButton label="Codeblock" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
          <span className="font-mono text-xs">{'{ }'}</span>
        </ToolButton>
        <ToolButton label="Link" active={state.link} onClick={() => setLinkOpen((open) => !open)}>
          <span className="text-xs underline">Link</span>
        </ToolButton>
        <ToolButton
          label="Tabelle einfügen"
          active={state.table}
          disabled={!state.canInsertTable}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableGlyph />
        </ToolButton>
        <Divider />
        <ToolButton label="Rückgängig" shortcut={`${modKey}+Z`} disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          ↶
        </ToolButton>
        <ToolButton label="Wiederholen" shortcut={`${modKey}+Shift+Z`} disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          ↷
        </ToolButton>
        {trailing && <div className="ml-auto pl-2">{trailing}</div>}
      </div>
      {state.table && <TableBar editor={editor} />}
      {linkOpen && <LinkBar editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function TableGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
    </svg>
  );
}

const ALIGNMENTS: { value: Exclude<ColumnAlign, null>; label: string; glyph: string }[] = [
  { value: 'left', label: 'Spalte linksbündig', glyph: 'M2 4h12M2 8h8M2 12h10' },
  { value: 'center', label: 'Spalte zentriert', glyph: 'M2 4h12M4 8h8M3 12h10' },
  { value: 'right', label: 'Spalte rechtsbündig', glyph: 'M2 4h12M6 8h8M4 12h10' },
];

/** While the cursor is in a table (US-26): rows, columns and their alignment. The header row always stays first. */
function TableBar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      header: inHeaderRow(e),
      align: columnAlign(e),
      canDeleteRow: e.can().deleteRow(),
      canDeleteColumn: e.can().deleteColumn(),
    }),
  });
  const chain = () => editor.chain().focus();
  const textButton = (text: string, label: string, onClick: () => void, disabled = false) => (
    <ToolButton label={label} disabled={disabled} onClick={onClick}>
      <span className="text-xs">{text}</span>
    </ToolButton>
  );
  const groupLabel = (text: string) => <span className="pr-0.5 pl-1.5 text-xs font-medium text-fg-subtle">{text}</span>;

  return (
    <div role="toolbar" aria-label="Tabelle" className="flex flex-wrap items-center gap-0.5 border-t border-line px-1 py-1">
      {groupLabel('Zeile')}
      {textButton('+ oben', 'Zeile oberhalb einfügen', () => chain().addRowBefore().run(), state.header)}
      {textButton('+ unten', 'Zeile unterhalb einfügen', () => chain().addRowAfter().run())}
      {textButton('löschen', 'Zeile löschen', () => chain().deleteRow().run(), state.header || !state.canDeleteRow)}
      <Divider />
      {groupLabel('Spalte')}
      {textButton('+ links', 'Spalte links einfügen', () => chain().addColumnBefore().run())}
      {textButton('+ rechts', 'Spalte rechts einfügen', () => chain().addColumnAfter().run())}
      {textButton('löschen', 'Spalte löschen', () => chain().deleteColumn().run(), !state.canDeleteColumn)}
      <Divider />
      {ALIGNMENTS.map((option) => (
        <ToolButton
          key={option.value}
          label={option.label}
          active={state.align === option.value}
          onClick={() => alignColumns(editor, state.align === option.value ? null : option.value)}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
            <path d={option.glyph} />
          </svg>
        </ToolButton>
      ))}
      <Divider />
      {textButton('Tabelle löschen', 'Tabelle löschen', () => chain().deleteTable().run())}
    </div>
  );
}

export function ListGlyph({ kind }: { kind: 'bullet' | 'ordered' | 'task' }) {
  const marker = (i: number) =>
    kind === 'bullet' ? <circle cx="3" cy={4 + i * 4} r="1" fill="currentColor" stroke="none" /> : kind === 'ordered' ? (
      <text x="1.5" y={5.5 + i * 4} fontSize="4" fill="currentColor" stroke="none">{i + 1}</text>
    ) : (
      <rect x="1.5" y={2.5 + i * 4} width="3" height="3" rx="0.6" />
    );
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {marker(i)}
          <path d={`M7 ${4 + i * 4}h7`} />
        </g>
      ))}
    </svg>
  );
}

function HighlightPicker({
  active,
  open,
  onOpenChange,
  onPick,
}: {
  active: HighlightColor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (color: HighlightColor | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <ToolButton label="Hervorheben" active={active !== null} onClick={() => onOpenChange(!open)}>
        <span className="rounded-sm px-0.5 text-xs font-semibold" data-highlight-swatch={active ?? 'yellow'}>
          A
        </span>
      </ToolButton>
      {open && (
        <div
          role="menu"
          aria-label="Farbe der Hervorhebung"
          className={`absolute top-8 left-0 z-20 flex items-center gap-1 px-2 ${popoverClass}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              role="menuitemradio"
              aria-checked={active === color.value}
              aria-label={color.label}
              title={color.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(color.value)}
              data-highlight-swatch={color.value}
              className={`size-6 rounded-full ring-1 ring-line ring-inset focus-visible:outline-2 focus-visible:outline-accent ${
                active === color.value ? 'outline-2 outline-offset-1 outline-accent' : ''
              }`}
            />
          ))}
          <button
            type="button"
            role="menuitem"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(null)}
            className="ml-1 rounded px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-surface-hover hover:text-fg"
          >
            Entfernen
          </button>
        </div>
      )}
    </div>
  );
}

/** Set, change or remove the link of the selection. */
function LinkBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(() => (editor.getAttributes('link').href as string | undefined) ?? '');

  function apply() {
    const url = href.trim();
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    onClose();
  }

  return (
    <form
      className="flex items-center gap-2 border-t border-line px-2 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          editor.commands.focus();
        }
      }}
    >
      <input
        inputMode="url"
        autoComplete="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        autoFocus
        value={href}
        onChange={(event) => setHref(event.target.value)}
        placeholder="https://…"
        aria-label="Adresse des Links"
        className={`!h-7 !py-0 !text-xs ${fieldClass}`}
      />
      <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-accent-text hover:bg-accent-muted">
        Übernehmen
      </button>
      {editor.isActive('link') && (
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            onClose();
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-fg-subtle hover:bg-surface-hover"
        >
          Entfernen
        </button>
      )}
    </form>
  );
}
