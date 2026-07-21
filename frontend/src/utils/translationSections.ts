/**
 * 이지리드 번역문을 소제목·번호 항목 단위로 분해 (작성양식 PDF 구조).
 */
import type { ImagePlacement } from "../api/client";
import { filterPreviewLines } from "./sanitizeTranslation";

export interface TranslationSection {
  heading: string | null;
  bodyLines: string[];
  /** image_placements.line_index 와 매칭 (섹션 제목 또는 항목 시작) */
  startLineIndex: number;
}

/** 양식: 1., 2. 등 번호 항목 — 각각 (삽화 | 글) 2단 */
export interface TranslationItem {
  lines: string[];
  startLineIndex: number;
}

export const STANDARD_CLOSING =
  "더 궁금한 것이 있으면 **소송구조 변호사**님에게 문의해 주세요.";

const NUMBERED_ITEM = /^\s*\d+[\).]\s/;
const CLOSING_CONTACT = /더\s*궁금한\s*것이\s*있으면.*문의/;

function closingPlain(line: string): string {
  return line.replace(/\*+/g, "").trim();
}

export function isStandardClosingLine(line: string): boolean {
  return closingPlain(line) === closingPlain(STANDARD_CLOSING);
}

/** export·미리보기: 마무리 문장은 2단(그림) 레이아웃 밖 */
export function splitStandardClosing(text: string): { body: string; closing: string | null } {
  const lines = text.split("\n");
  while (lines.length && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }
  if (!lines.length) {
    return { body: "", closing: null };
  }

  const last = lines[lines.length - 1].trim();
  if (isStandardClosingLine(last) || CLOSING_CONTACT.test(last)) {
    lines.pop();
    while (lines.length && !lines[lines.length - 1]?.trim()) {
      lines.pop();
    }
    return { body: lines.join("\n"), closing: STANDARD_CLOSING };
  }

  return { body: text, closing: null };
}

export function mergeWithStandardClosing(body: string, closing: string | null): string {
  const trimmed = body.replace(/\s+$/, "");
  if (!closing) return trimmed;
  if (!trimmed) return closing;
  return `${trimmed}\n\n${closing}`;
}

export function isSectionHeading(line: string): boolean {
  const s = line.trim();
  return (
    (s.startsWith("<") && s.endsWith(">")) ||
    s.startsWith("■") ||
    s.startsWith("#")
  );
}

export function isNumberedItemLine(line: string): boolean {
  return NUMBERED_ITEM.test(line);
}

export function parseSectionItems(section: TranslationSection): TranslationItem[] {
  const body = section.bodyLines;
  if (body.length === 0) return [];

  const bodyStart = section.startLineIndex + (section.heading ? 1 : 0);
  const hasNumbered = body.some(isNumberedItemLine);

  if (!hasNumbered) {
    return [{ lines: [...body], startLineIndex: bodyStart }];
  }

  const items: TranslationItem[] = [];
  let current: string[] = [];
  let currentStart = bodyStart;

  body.forEach((line, offset) => {
    const globalIdx = bodyStart + offset;
    if (isNumberedItemLine(line)) {
      if (current.length) {
        items.push({ lines: current, startLineIndex: currentStart });
      }
      current = [line];
      currentStart = globalIdx;
    } else {
      if (!current.length) currentStart = globalIdx;
      current.push(line);
    }
  });

  if (current.length) {
    items.push({ lines: current, startLineIndex: currentStart });
  }

  return items;
}

export function parseTranslationSections(text: string): TranslationSection[] {
  const lines = filterPreviewLines(text);
  if (lines.length === 0) return [];

  const sections: TranslationSection[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isSectionHeading(lines[i])) {
      const heading = lines[i];
      const startLineIndex = i;
      i += 1;
      const bodyLines: string[] = [];
      while (i < lines.length && !isSectionHeading(lines[i])) {
        bodyLines.push(lines[i]);
        i += 1;
      }
      sections.push({ heading, bodyLines, startLineIndex });
    } else {
      const startLineIndex = i;
      const bodyLines: string[] = [];
      while (i < lines.length && !isSectionHeading(lines[i])) {
        bodyLines.push(lines[i]);
        i += 1;
      }
      sections.push({ heading: null, bodyLines, startLineIndex });
    }
  }

  return sections;
}

export function sectionsToTranslationText(sections: TranslationSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.heading) lines.push(section.heading);
    lines.push(...section.bodyLines);
  }
  return lines.join("\n");
}

export function formatHeadingDisplay(line: string): string {
  return line.replace(/^#+\s*/, "").trim();
}

export function normalizeSectionHeading(text: string): string {
  return text.trim().replace(/^#+\s*/, "").trim();
}

export function findSectionForLineIndex(
  text: string,
  lineIndex: number,
): TranslationSection | undefined {
  return parseTranslationSections(text).find((section) => {
    if (section.startLineIndex === lineIndex) return true;
    const bodyStart = section.startLineIndex + (section.heading ? 1 : 0);
    const bodyEnd = bodyStart + section.bodyLines.length;
    return lineIndex >= bodyStart && lineIndex < bodyEnd;
  });
}

/** 그림 탭·추출 — 항목 startLineIndex 기준. */
export function resolvePlacementForItem(
  placements: ImagePlacement[],
  item: TranslationItem,
): ImagePlacement | undefined {
  return placements.find((p) => p.line_index === item.startLineIndex);
}

/** 소제목 줄(line_index)에 배치된 대표 그림. */
export function resolvePlacementForSectionHeading(
  placements: ImagePlacement[],
  section: TranslationSection,
): ImagePlacement | undefined {
  if (!section.heading) return undefined;
  return placements.find((p) => p.line_index === section.startLineIndex);
}

/** @deprecated 섹션 단위 — resolvePlacementForSectionHeading 사용 */
export function resolvePlacementForSection(
  placements: ImagePlacement[],
  section: TranslationSection,
): ImagePlacement | undefined {
  return resolvePlacementForSectionHeading(placements, section);
}

/** 추출용 — line_index별 배치 유지. */
export function filterPlacementsForExport(
  text: string,
  placements: ImagePlacement[],
): ImagePlacement[] {
  if (!placements.length) return [];
  const enriched = enrichPlacementsWithHeadings(text, placements);
  const byLine = new Map<number, ImagePlacement>();
  for (const p of enriched.sort((a, b) => a.line_index - b.line_index)) {
    byLine.set(p.line_index, p);
  }
  return Array.from(byLine.values());
}

export function enrichPlacementsWithHeadings(
  text: string,
  placements: ImagePlacement[],
): ImagePlacement[] {
  if (!placements.length) return placements;
  return placements.map((p) => {
    if (p.section_heading) return p;
    const section = findSectionForLineIndex(text, p.line_index);
    if (section?.heading) return { ...p, section_heading: section.heading };
    return p;
  });
}
