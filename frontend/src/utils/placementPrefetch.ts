/**
 * 번역 탭에서 생성·편집 직후 시각자료 배치를 백그라운드로 미리 돌린다.
 * 시각자료 탭은 동일 텍스트에 대해 진행 중/완료된 prefetch를 재사용한다.
 */
import type { ImagePlacement, TranslationSegment } from "../api/client";
import { detectImagePlacements, updateTranslation } from "../api/client";
import { buildEnsureContext } from "./documentLoader";
import { filterPlacementsRespectingClears } from "./imageSlotPrefs";
import { getWorkflowSnapshot, saveWorkflowSnapshot } from "./workflowCache";

export type PlacementPrefetchStatus = "idle" | "running" | "done" | "error";

export interface PlacementPrefetchState {
  textFingerprint: string;
  status: PlacementPrefetchStatus;
  promise: Promise<ImagePlacement[]> | null;
  error?: string;
  generation: number;
}

const states = new Map<string, PlacementPrefetchState>();

export function translationTextFingerprint(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function segmentsToTranslationText(segments: TranslationSegment[]): string {
  return segments.map((s) => s.easy_text).filter(Boolean).join("\n\n");
}

export function getPlacementPrefetchState(docId: string): PlacementPrefetchState | null {
  return states.get(docId) ?? null;
}

function setState(docId: string, next: PlacementPrefetchState): void {
  states.set(docId, next);
}

/**
 * 번역문 기준으로 시각자료 자동 배치를 백그라운드 시작.
 * 같은 텍스트가 이미 돌고 있거나 완료됐으면 재호출하지 않는다.
 */
export function startPlacementPrefetch(
  docId: string,
  segments: TranslationSegment[],
  options?: { persist?: boolean },
): PlacementPrefetchState | null {
  const text = segmentsToTranslationText(segments);
  const fp = translationTextFingerprint(text);
  if (!docId || !fp) return null;

  const prev = states.get(docId);
  if (
    prev &&
    prev.textFingerprint === fp &&
    (prev.status === "running" || prev.status === "done")
  ) {
    return prev;
  }

  const generation = (prev?.generation ?? 0) + 1;
  const existingSource =
    prev && prev.textFingerprint !== fp
      ? (segments[0]?.image_placements ?? []).filter((p) => !p.auto_filled)
      : (segments[0]?.image_placements ?? []);

  let resolvePromise!: (value: ImagePlacement[]) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<ImagePlacement[]>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const running: PlacementPrefetchState = {
    textFingerprint: fp,
    status: "running",
    promise,
    generation,
  };
  setState(docId, running);

  void (async () => {
    try {
      const ensure = buildEnsureContext(docId);
      const clearedExisting = filterPlacementsRespectingClears(docId, existingSource);
      let filled = await detectImagePlacements(docId, {
        ...(ensure ?? {}),
        translationText: text,
        existingPlacements: clearedExisting,
      });
      filled = filterPlacementsRespectingClears(docId, filled);

      const current = states.get(docId);
      if (!current || current.generation !== generation) {
        resolvePromise(filled);
        return;
      }

      const snap = getWorkflowSnapshot(docId);
      const snapText = translationTextFingerprint(
        snap?.translation_text ??
          segmentsToTranslationText(snap?.translation_segments ?? []),
      );
      // 사용자가 더 최신 텍스트로 편집했으면 결과 적용 생략 (새 prefetch가 따로 돔)
      if (snapText && snapText !== fp) {
        setState(docId, {
          ...current,
          status: "idle",
          promise: null,
        });
        resolvePromise(filled);
        return;
      }

      const baseSegs =
        snap?.translation_segments?.length ? snap.translation_segments : segments;
      const nextSegs = baseSegs.map((s, i) =>
        i === 0 ? { ...s, image_placements: filled } : s,
      );
      saveWorkflowSnapshot(docId, {
        translation_segments: nextSegs,
        translation_text: text,
      });

      if (options?.persist !== false) {
        try {
          if (ensure) {
            await updateTranslation(docId, nextSegs, {
              ...ensure,
              summary: ensure.summary,
            });
          } else {
            await updateTranslation(docId, nextSegs);
          }
        } catch (err) {
          console.error("prefetch placement persist failed", err);
        }
      }

      setState(docId, {
        textFingerprint: fp,
        status: "done",
        promise,
        generation,
      });
      resolvePromise(filled);
    } catch (err) {
      const current = states.get(docId);
      if (current && current.generation === generation) {
        setState(docId, {
          textFingerprint: fp,
          status: "error",
          promise: null,
          generation,
          error: err instanceof Error ? err.message : "시각자료 미리 배치 실패",
        });
      }
      rejectPromise(err);
    }
  })();

  return running;
}

/** 시각자료 탭: 동일 텍스트 prefetch가 있으면 그 Promise를 기다린다. */
export async function awaitPlacementPrefetchIfMatching(
  docId: string,
  text: string,
): Promise<ImagePlacement[] | null> {
  const fp = translationTextFingerprint(text);
  const state = states.get(docId);
  if (!state || state.textFingerprint !== fp) return null;
  if (state.status === "done") {
    const segs = getWorkflowSnapshot(docId)?.translation_segments;
    return segs?.[0]?.image_placements ?? null;
  }
  if (state.status === "running" && state.promise) {
    try {
      return await state.promise;
    } catch {
      return null;
    }
  }
  return null;
}

export function hasFreshPrefetchedPlacements(docId: string, text: string): boolean {
  const fp = translationTextFingerprint(text);
  const state = states.get(docId);
  if (!state || state.textFingerprint !== fp || state.status !== "done") return false;
  const placements = getWorkflowSnapshot(docId)?.translation_segments?.[0]?.image_placements;
  return Boolean(placements?.length);
}
