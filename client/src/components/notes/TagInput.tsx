import { useId, useState } from 'react';
import { MAX_TAG_LENGTH, normalizeTag } from '../../utils/tags';

interface TagInputProps {
  tags: string[];
  /** Existing tags offered for autocompletion. */
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

/** Enter, comma or leaving the field adds a tag; Backspace in the empty field removes the last one. */
export default function TagInput({ tags, suggestions, onChange }: TagInputProps) {
  const [text, setText] = useState('');
  const listId = useId();

  function addTags(raw: string[]) {
    const added = raw.map(normalizeTag).filter((tag, i, all) => tag && !tags.includes(tag) && all.indexOf(tag) === i);
    if (added.length > 0) onChange([...tags, ...added]);
  }

  function handleChange(value: string) {
    // Typing or pasting a comma completes every tag before it.
    const parts = value.split(',');
    const rest = parts.pop() ?? '';
    if (parts.length > 0) addTags(parts);
    setText(rest);
  }

  function commit() {
    addTags([text]);
    setText('');
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-accent-muted py-0.5 pl-2 pr-1 text-xs text-accent-text">
          {tag}
          <button
            type="button"
            aria-label={`Tag „${tag}“ entfernen`}
            className="rounded-full px-1 leading-none text-accent-text/60 hover:bg-accent-muted hover:text-accent-text"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        list={listId}
        maxLength={MAX_TAG_LENGTH}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder={tags.length === 0 ? 'Tags hinzufügen …' : 'Tag hinzufügen …'}
        aria-label="Tags"
        className="min-w-32 flex-1 bg-transparent py-0.5 text-sm placeholder:text-fg-faint focus:outline-none"
      />
      <datalist id={listId}>
        {suggestions
          .filter((tag) => !tags.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  );
}
