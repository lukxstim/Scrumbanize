import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { LinkCandidate } from '../../types/link';
import { linksApi } from '../../utils/api';
import { caretRect } from '../../utils/caret';
import { findLinkTrigger, insertLinkAt } from '../../utils/contentLinks';

const SEARCH_DELAY_MS = 120;

interface SourcePicker {
  start: number;
  query: string;
  anchor: DOMRect;
  items: LinkCandidate[];
  active: number;
  loading: boolean;
}

/**
 * The [[ picker in the Markdown source view (US-22): watches the text before the caret, asks the server, and on a
 * pick writes `[Titel](note:42)` in place of "[[…". `projectId` undefined turns it off.
 */
export function useSourceLinkPicker(
  textarea: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (markdown: string) => void,
  projectId: number | undefined,
) {
  const [picker, setPicker] = useState<SourcePicker | null>(null);
  // Escape closes the picker for this "[[" until it is gone.
  const dismissed = useRef<number | null>(null);
  const query = picker?.query;
  const open = picker !== null;

  // Look again after every change of the text or the caret.
  function check() {
    const element = textarea.current;
    if (projectId === undefined || !element || element.selectionStart !== element.selectionEnd) return setPicker(null);
    const trigger = findLinkTrigger(element.value, element.selectionStart);
    if (!trigger || trigger.start === dismissed.current) {
      if (!trigger) dismissed.current = null;
      return setPicker(null);
    }
    setPicker((current) => ({
      start: trigger.start,
      query: trigger.query,
      anchor: caretRect(element, trigger.start),
      items: current?.start === trigger.start ? current.items : [],
      active: current?.start === trigger.start && current.query === trigger.query ? current.active : 0,
      loading: current?.query !== trigger.query || current.loading,
    }));
  }

  useEffect(() => {
    if (!open || projectId === undefined || query === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      linksApi
        .candidates(query, projectId, controller.signal)
        .then((items) => setPicker((current) => (current && current.query === query ? { ...current, items, loading: false, active: 0 } : current)))
        .catch(() => {});
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, projectId]);

  const caret = useRef<number | null>(null);
  // Put the caret behind the inserted link once React has written the new text.
  useEffect(() => {
    if (caret.current === null || !textarea.current) return;
    textarea.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value, textarea]);

  function pick(item: LinkCandidate) {
    const element = textarea.current;
    if (!element || !picker) return;
    const next = insertLinkAt(element.value, picker, element.selectionStart, item, item.title);
    caret.current = next.caret;
    setPicker(null);
    onChange(next.text);
    element.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!picker) return;
    const count = picker.items.length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
      event.preventDefault();
      setPicker({ ...picker, active: (picker.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count });
    } else if ((event.key === 'Enter' || event.key === 'Tab') && picker.items[picker.active]) {
      event.preventDefault();
      pick(picker.items[picker.active]!);
    } else if (event.key === 'Escape') {
      // Only the picker closes, not a dialog around the editor.
      event.preventDefault();
      event.stopPropagation();
      dismissed.current = picker.start;
      setPicker(null);
    }
  }

  return {
    picker,
    pick,
    hover: (index: number) => setPicker((current) => current && { ...current, active: index }),
    handlers: { onKeyDown, onKeyUp: check, onClick: check, onInput: check, onBlur: () => setPicker(null) },
  };
}
