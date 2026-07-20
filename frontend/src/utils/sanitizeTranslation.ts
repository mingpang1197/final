/** Remove LLM revision meta headers from easy-read translation text. */

const META_SECTION_START = /^###\s*수정\s*사항/;

export function sanitizeTranslationText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inMeta = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped === "## 수정된 이지리드 번역본") {
      continue;
    }
    if (META_SECTION_START.test(stripped)) {
      inMeta = true;
      continue;
    }
    if (inMeta) {
      continue;
    }
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function filterPreviewLines(text: string): string[] {
  return sanitizeTranslationText(text)
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("---"));
}
