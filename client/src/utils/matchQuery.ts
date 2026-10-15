/** True if every word of `query` appears in one of `texts` (case-insensitive, German-aware). */
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.join(' ').toLocaleLowerCase('de');
  return words.every((word) => haystack.includes(word));
}
