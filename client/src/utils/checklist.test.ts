import { describe, expect, it } from 'vitest';
import { checklistProgress } from './checklist';

describe('checklistProgress', () => {
  it('counts checked and open items in all list styles', () => {
    const markdown = ['- [x] Entwurf', '- [ ] Review', '  * [X] verschachtelt', '1. [ ] nummeriert', '> - [x] im Zitat', '- normaler Punkt'].join('\n');
    expect(checklistProgress(markdown)).toEqual({ done: 3, total: 5 });
  });

  it('ignores code blocks and text without a checklist', () => {
    expect(checklistProgress('```\n- [ ] kein Punkt\n```\n- [x] echt')).toEqual({ done: 1, total: 1 });
    expect(checklistProgress('Nur Text mit [ ] Klammern')).toEqual({ done: 0, total: 0 });
  });
});
