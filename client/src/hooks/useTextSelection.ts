import { useState, type SyntheticEvent } from 'react';

/** The Markdown currently selected in a textarea (the editor's source view); empty when nothing is selected. */
export function useTextSelection() {
  const [selection, setSelection] = useState('');

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
