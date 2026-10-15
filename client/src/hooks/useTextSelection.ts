import { useEffect, useState, type RefObject, type SyntheticEvent } from 'react';

/**
 * The text currently selected in the editor: the raw Markdown inside the textarea in edit mode,
 * or the rendered text inside the preview container in preview mode. Empty when nothing is selected.
 */
export function useTextSelection(mode: 'edit' | 'preview', previewRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState('');

  useEffect(() => {
    setSelection('');
    if (mode !== 'preview') return;

    const update = () => {
      const current = window.getSelection();
      const container = previewRef.current;
      const inside =
        current && !current.isCollapsed && container?.contains(current.anchorNode) && container.contains(current.focusNode);
      setSelection(inside ? current.toString() : '');
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [mode, previewRef]);

  const textareaHandlers = {
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart, selectionEnd } = event.currentTarget;
      setSelection(value.slice(selectionStart, selectionEnd));
    },
    // A selection the user can no longer see should not decide what gets converted.
    onBlur: () => setSelection(''),
  };

  return { selection: selection.trim() ? selection : '', textareaHandlers };
}
