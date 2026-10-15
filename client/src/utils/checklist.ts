/** GFM task list items ("- [ ] …", "* [x] …", "1. [X] …"), also nested and in quotes. */
const ITEM = /^[\s>]*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s/gm;

/** Checked and total checklist items in Markdown; total 0 if there are none. Code blocks are left out. */
export function checklistProgress(markdown: string): { done: number; total: number } {
  const text = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  let done = 0;
  let total = 0;
  for (const match of text.matchAll(ITEM)) {
    total++;
    if (match[1] !== ' ') done++;
  }
  return { done, total };
}
