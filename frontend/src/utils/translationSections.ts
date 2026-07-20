/**
 * 이지리드 번역문을 소제목 단위 섹션으로 분해·조합한다.
 */
import type { ImagePlacement } from "../api/client";
import { filterPreviewLines } from "./sanitizeTranslation";

export interface TranslationSection {
  heading: string | null;
  bodyLines: string[];
  /** image_placements.line_index 와 매칭 */
  startLineIndex: number;
}

export function isSectionHeading(line: string): boolean {
  const s = line.trim();
  return (
    (s.startsWith("<") && s.endsWith(">")) ||
    s.startsWith("■") ||
    s.startsWith("#")
  );
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

/** 그림 탭·추출 공통 — section_heading 우선, 없으면 line_index. */
export function resolvePlacementForSection(
  placements: ImagePlacement[],
  section: TranslationSection,
): ImagePlacement | undefined {
  if (section.heading) {
    const target = normalizeSectionHeading(section.heading);
    const byHeading = placements.find(
      (p) => p.section_heading && normalizeSectionHeading(p.section_heading) === target,
    );
    if (byHeading) return byHeading;
  }
  return placements.find((p) => p.line_index === section.startLineIndex);
}

/** 추출용 — 섹션당 1개, 사용자 배치(section_heading) 우선. */
export function filterPlacementsForExport(
  text: string,
  placements: ImagePlacement[],
): ImagePlacement[] {
  if (!placements.length) return [];
  const enriched = enrichPlacementsWithHeadings(text, placements);
  const sections = parseTranslationSections(text);
  const headingIndices = new Set(
    sections.filter((s) => s.heading).map((s) => s.startLineIndex),
  );

  const manual = enriched.filter((p) => p.section_heading);
  if (manual.length > 0) {
    const byHeading = new Map<string, ImagePlacement>();
    for (const p of manual) {
      byHeading.set(normalizeSectionHeading(p.section_heading!), p);
    }
    return Array.from(byHeading.values()).sort((a, b) => a.line_index - b.line_index);
  }

  const byIndex = new Map<number, ImagePlacement>();
  for (const p of enriched) {
    if (headingIndices.has(p.line_index)) {
      byIndex.set(p.line_index, p);
    }
  }
  return Array.from(byIndex.values()).sort((a, b) => a.line_index - b.line_index);
}

/** 기존 배치에 section_heading이 없으면 line_index로 채운다 (export 정렬용). */
export function enrichPlacementsWithHeadings(
  text: string,
  placements: ImagePlacement[],
): ImagePlacement[] {
  if (!placements.length) return placements;
  const sections = parseTranslationSections(text);
  return placements.map((p) => {
    if (p.section_heading) return p;
    const section = sections.find((s) => s.startLineIndex === p.line_index);
    if (section?.heading) return { ...p, section_heading: section.heading };
    return p;
  });
}
