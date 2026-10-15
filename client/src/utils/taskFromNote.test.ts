import { describe, expect, it } from 'vitest';
import { buildTaskDraft } from './taskFromNote';

const note = { title: 'Kickoff-Meeting', content: '# Agenda\n\n- [ ] **Angebot** schreiben\n- Termin finden\n' };

describe('buildTaskDraft', () => {
  it('maps the whole note', () => {
    expect(buildTaskDraft(note)).toEqual({ title: 'Kickoff-Meeting', description: note.content.trim() });
  });

  it('falls back to a placeholder for untitled notes', () => {
    expect(buildTaskDraft({ title: '  ', content: 'x' }).title).toBe('Unbenannte Notiz');
  });

  it('ignores whitespace-only selections', () => {
    expect(buildTaskDraft(note, ' \n ')).toEqual(buildTaskDraft(note));
  });

  it('uses the first line of a selection, without Markdown, as title', () => {
    expect(buildTaskDraft(note, '\n- [ ] **Angebot** schreiben\n- Termin finden')).toEqual({
      title: 'Angebot schreiben',
      description: '- [ ] **Angebot** schreiben\n- Termin finden',
    });
    expect(buildTaskDraft(note, '## [Docs](https://example.com) lesen').title).toBe('Docs lesen');
    expect(buildTaskDraft(note, '1. `npm test` ausführen').title).toBe('npm test ausführen');
  });

  it('falls back to the note title if the selection has no text left', () => {
    expect(buildTaskDraft(note, '- ').title).toBe('Kickoff-Meeting');
  });

  it('shortens long titles', () => {
    expect(buildTaskDraft(note, 'x'.repeat(300)).title).toHaveLength(120);
  });
});
