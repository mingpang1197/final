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

const NUMBERED_ITEM = /^\s*\d+[\).]\s/;

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
  sectionHeading: string | null,
): ImagePlacement | undefined {
  const exact = placements.find((p) => p.line_index === item.startLineIndex);
  if (exact) return exact;

  if (sectionHeading) {
    const target = normalizeSectionHeading(sectionHeading);
    const inSection = placements.filter(
      (p) => p.section_heading && normalizeSectionHeading(p.section_heading) === target,
    );
    if (inSection.length === 1) return inSection[0];
  }

  return undefined;
}

/** @deprecated 섹션 단위 — resolvePlacementForItem 사용 */
export function resolvePlacementForSection(
  placements: ImagePlacement[],
  section: TranslationSection,
): ImagePlacement | undefined {
  const items = parseSectionItems(section);
  for (const item of items) {
    const p = resolvePlacementForItem(placements, item, section.heading);
    if (p) return p;
  }
  return undefined;
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
