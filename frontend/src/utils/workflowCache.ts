/**
 * 워크플로 단계별 결과 sessionStorage 캐시 (요약·번역).
 *
 * 서버리스/Vercel에서 DB 조회가 실패하거나 지연될 때 탭 이동 후 재생성을 방지한다.
 */
import type { ImagePlacement, TranslationSegment } from "../api/client";

export interface WorkflowSnapshot {
  summary?: string;
  translation_segments?: TranslationSegment[];
  translation_text?: string;
  filename?: string;
}

const WORKFLOW_KEY_PREFIX = "easyread:workflow:";

export function getWorkflowSnapshot(docId: string): WorkflowSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`${WORKFLOW_KEY_PREFIX}${docId}`);
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowSnapshot;
  } catch {
    return null;
  }
}

export function saveWorkflowSnapshot(docId: string, patch: WorkflowSnapshot): void {
  try {
    const prev = getWorkflowSnapshot(docId) ?? {};
    sessionStorage.setItem(
      `${WORKFLOW_KEY_PREFIX}${docId}`,
      JSON.stringify({ ...prev, ...patch }),
    );
  } catch {
    /* quota exceeded — ignore */
  }
}

export function hasStoredSummary(docId: string, serverSummary?: string | null): boolean {
  return Boolean(serverSummary?.trim() || getWorkflowSnapshot(docId)?.summary?.trim());
}

export function resolveSummary(docId: string, serverSummary?: string | null): string {
  const trimmed = serverSummary?.trim();
  if (trimmed) return trimmed;
  return getWorkflowSnapshot(docId)?.summary?.trim() ?? "";
}

function mergePlacements(
  server?: ImagePlacement[],
  cached?: ImagePlacement[],
): ImagePlacement[] {
  const merged = new Map<number, ImagePlacement>();
  for (const p of server ?? []) merged.set(p.line_index, p);
  for (const p of cached ?? []) {
    if (!merged.has(p.line_index)) merged.set(p.line_index, p);
  }
  return Array.from(merged.values()).sort((a, b) => a.line_index - b.line_index);
}

function mergeSegment(
  server: TranslationSegment,
  cached?: TranslationSegment,
): TranslationSegment {
  const placements = mergePlacements(
    server.image_placements,
    cached?.image_placements,
  );
  return {
    ...server,
    easy_text: server.easy_text || cached?.easy_text || "",
    image_placements: placements.length ? placements : server.image_placements ?? cached?.image_placements,
  };
}

export function resolveTranslationSegments(
  docId: string,
  serverSegments: TranslationSegment[],
): TranslationSegment[] {
  const cached = getWorkflowSnapshot(docId)?.translation_segments ?? [];
  if (serverSegments.length === 0) return cached;
  if (cached.length === 0) return serverSegments;

  return serverSegments.map((seg, i) => {
    const cachedSeg =
      cached[i] ?? cached.find((c) => c.id === seg.id) ?? cached[0];
    return mergeSegment(seg, cachedSeg);
  });
}
