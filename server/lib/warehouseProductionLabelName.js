/** Product name lines on 80×68 mm labels — keep in sync with ZPL ^FB wrapping. */

export function wrapProductionLabelNameLines(name, maxLines = 2, maxCharsPerLine = 28) {
  const text = String(name || '').trim();
  if (!text) return [''];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > maxCharsPerLine - 1
      ? `${last.slice(0, maxCharsPerLine - 1)}…`
      : `${last}…`;
  }
  return lines.length ? lines : [text.slice(0, maxCharsPerLine)];
}
