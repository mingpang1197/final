/**
 * 그림 배치 페이지 (워크플로 4단계) — Figma UI.
 * 번역 세그먼트 + 이미지 DB 카탈로그 2-pane.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ImageCatalogItem, ImagePlacement, TranslationSegment } from "../api/client";
import {
  detectImagePlacements,
  getDocument,
  getImageCatalog,
  updateTranslation,
} from "../api/client";
import { TranslationSegmentView } from "../components/TranslationSegment";
import { PanePanel } from "../components/ui/PanePanel";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { ensurePayload, getCachedUpload } from "../utils/docCache";
import { sanitizeTranslationText } from "../utils/sanitizeTranslation";
import { useDebouncedSave } from "../utils/useDebouncedSave";

function sanitizeSegments(segments: TranslationSegment[]): TranslationSegment[] {
  return segments.map((s) => ({
    ...s,
    easy_text: s.easy_text ? sanitizeTranslationText(s.easy_text) : s.easy_text,
  }));
}

export function ImagesPage() {
  const { id } = useParams<{ id: string }>();
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<ImageCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const doc = await getDocument(id);
    setFilename(doc.filename);
    let segs = sanitizeSegments(doc.translation_segments);
    const main = segs[0];
    if (main?.easy_text && !(main.image_placements?.length ?? 0)) {
      try {
        const placements = await detectImagePlacements(id);
        if (placements.length) {
          segs = segs.map((s, i) =>
            i === 0 ? { ...s, image_placements: placements } : s,
          );
        }
      } catch {
        /* ignore */
      }
    }
    setSegments(segs);
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getImageCatalog(catalogQuery)
      .then((data) => {
        if (!cancelled) setCatalogItems(data.slice(0, 40));
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogQuery]);

  const persistTranslation = useCallback(async () => {
    if (!id || segments.length === 0) return;
    setSaveStatus("saving");
    try {
      const cached = getCachedUpload(id);
      await updateTranslation(id, segments, ensurePayload(cached));
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }, [id, segments]);

  useDebouncedSave(segments, persistTranslation);

  function editSegment(segId: string, text: string) {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, easy_text: text, source: "manual" as const } : s)),
    );
  }

  function editPlacements(segId: string, placements: ImagePlacement[]) {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, image_placements: placements } : s)),
    );
  }

  const saveLabel =
    saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨" : "";

  return (
    <WorkflowLayout
      step="images"
      filename={filename ? `${filename}${saveLabel ? ` · ${saveLabel}` : ""}` : undefined}
      prevNav={id ? { label: "번역", to: `/documents/${id}/translate` } : undefined}
      nextNav={id ? { label: "추출", to: `/documents/${id}/export` } : undefined}
      error={error || undefined}
    >
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0">
        <PanePanel title="이지리드">
          <div className="flex-1 min-h-0 overflow-auto">
            {segments.length === 0 ? (
              <p className="text-sm text-coolgray-60">번역을 먼저 생성해 주세요.</p>
            ) : (
              segments.map((seg) => (
                <TranslationSegmentView
                  key={seg.id}
                  segment={seg}
                  onEdit={editSegment}
                  onPlacementsChange={editPlacements}
                  fill={segments.length === 1}
                />
              ))
            )}
          </div>
        </PanePanel>

        <PanePanel title="그림 DB">
          <input
            type="search"
            placeholder="제목 또는 파일명 검색"
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            className="w-full mb-3 h-10 px-3 bg-coolgray-10 border-b border-coolgray-30 text-sm outline-none focus:border-primary-60"
          />
          <div className="flex-1 min-h-0 overflow-auto">
            {catalogLoading ? (
              <p className="text-sm text-coolgray-60">불러오는 중...</p>
            ) : catalogItems.length === 0 ? (
              <p className="text-sm text-coolgray-60">검색 결과가 없습니다.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {catalogItems.map((item) => (
                  <li
                    key={item.image_file}
                    className="rounded-lg border border-coolgray-20 p-2 bg-coolgray-10"
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      className="mx-auto h-24 w-full object-contain bg-white rounded"
                    />
                    <p className="mt-2 text-xs text-coolgray-90 line-clamp-2">{item.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PanePanel>
      </div>
    </WorkflowLayout>
  );
}
