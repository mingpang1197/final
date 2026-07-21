/** 이지리드 강조(**텍스트**) 편집·렌더 유틸 */

export function toggleBoldMarkers(text: string): string {
  const trimmed = text.trim();
  const wrapped = trimmed.match(/^\*\*(.+)\*\*$/);
  if (wrapped) return wrapped[1];
  if (!trimmed) return text;
  return `**${trimmed}**`;
}

export function wrapSelectionBold(
  text: string,
  start: number,
  end: number,
): { text: string; selectionStart: number; selectionEnd: number } {
  if (start === end) {
    const next = toggleBoldMarkers(text);
    return { text: next, selectionStart: next.length, selectionEnd: next.length };
  }
  const selected = text.slice(start, end);
  if (selected.startsWith("**") && selected.endsWith("**") && selected.length > 4) {
    const unwrapped = selected.slice(2, -2);
    const next = text.slice(0, start) + unwrapped + text.slice(end);
    return { text: next, selectionStart: start, selectionEnd: start + unwrapped.length };
  }
  const wrapped = `**${selected}**`;
  const next = text.slice(0, start) + wrapped + text.slice(end);
  return { text: next, selectionStart: start, selectionEnd: start + wrapped.length };
}

export function splitBoldParts(text: string): string[] {
  return text.split(/(\*\*.+?\*\*)/g);
}

export function hasBoldMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(text);
}
