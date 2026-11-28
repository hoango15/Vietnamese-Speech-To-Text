export interface TextPart { text: string; match: boolean }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightText(text: string, query: string): TextPart[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const parts: TextPart[] = [];
  const pattern = new RegExp(escapeRegExp(needle), "giu");
  let last = 0, found: RegExpExecArray | null;
  while ((found = pattern.exec(text))) {
    if (found.index > last) parts.push({ text: text.slice(last, found.index), match: false });
    parts.push({ text: found[0], match: true });
    last = found.index + found[0].length;
    if (!found[0].length) pattern.lastIndex++;
  }
  if (last < text.length || !parts.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}
