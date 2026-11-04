import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { editorExtensions } from '../editor/extensions';
import { ListGlyph, ToolButton } from '../editor/EditorToolbar';
import { modKey } from '../ui/Kbd';

export interface QuickNoteEditorProps {
  /** Markdown; taken over again whenever `revision` changes (a version from elsewhere). */
  value: string;
  revision: number;
  onChange: (markdown: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  autoFocus?: boolean;
}

/**
 * The text of a quick note card (US-26), like the Windows Sticky Notes: always ready to type into, formatted as it is
 * written; while it has the focus, a small bar below offers bold, italic, strikethrough, bullets and checkboxes.
 * A checkbox can be ticked without editing the card. Loaded on demand, like the big editor.
 */
export default function QuickNoteEditor({ value, revision, onChange, onFocus, onBlur, autoFocus = false }: QuickNoteEditorProps) {
  const callbacks = useRef({ onChange, onFocus, onBlur });
  useEffect(() => {
    callbacks.current = { onChange, onFocus, onBlur };
  });
  const [focused, setFocused] = useState(false);
  const [extensions] = useState(() => editorExtensions('Notiz …'));

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': 'Kurznotiz',
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'rich-text quick-note prose prose-sm prose-zinc dark:prose-invert max-w-none px-3 pb-3 focus:outline-none',
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape') return false;
        (view.dom as HTMLElement).blur();
        return true;
      },
    },
    // Only real edits arrive here (also ticking a checkbox); the empty paragraph kept at the end is not stored.
    onUpdate: ({ editor: e }) => callbacks.current.onChange(e.getMarkdown().trimEnd()),
    onFocus: () => {
      setFocused(true);
      callbacks.current.onFocus();
    },
    onBlur: () => {
      setFocused(false);
      callbacks.current.onBlur();
    },
  });

  // A version from elsewhere: replaces the text without counting as an edit here.
  const shownRevision = useRef(revision);
  useEffect(() => {
    if (!editor || revision === shownRevision.current) return;
    shownRevision.current = revision;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [editor, revision, value]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      {focused && <QuickToolbar editor={editor} />}
    </>
  );
}

function QuickToolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      bulletList: e.isActive('bulletList'),
      taskList: e.isActive('taskList'),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatierung" className="flex items-center gap-0.5 border-t border-black/5 px-1.5 py-1 dark:border-white/10">
      <ToolButton label="Fett" shortcut={`${modKey}+B`} active={state.bold} onClick={() => chain().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton label="Kursiv" shortcut={`${modKey}+I`} active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <span className="font-serif italic">I</span>
      </ToolButton>
      <ToolButton label="Durchgestrichen" shortcut={`${modKey}+Shift+S`} active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <span className="line-through">S</span>
      </ToolButton>
      <ToolButton label="Aufzählung" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <ListGlyph kind="bullet" />
      </ToolButton>
      <ToolButton label="Checkliste" active={state.taskList} onClick={() => chain().toggleTaskList().run()}>
        <ListGlyph kind="task" />
      </ToolButton>
    </div>
  );
}
