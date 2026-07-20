/**
 * 그림 배치 페이지 (워크플로 4단계) — Figma 그림 UI.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ImageCatalogItem, ImagePlacement, TranslationSegment } from "../api/client";
import {
  detectImagePlacements,
  getDocument,
  getImageCatalog,
  refineTranslation,
  updateTranslation,
} from "../api/client";
import { PromptBar } from "../components/PromptBar";
import { TranslationSegmentView } from "../components/TranslationSegment";
import { IconChevronLeft, IconChevronRight } from "../components/ui/icons";
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
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<ImageCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다");
    }
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

  async function applyPrompt() {
    if (!id || !prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const doc = await refineTranslation(id, prompt);
      setSegments(sanitizeSegments(doc.translation_segments));
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 수정 실패");
    } finally {
      setLoading(false);
    }
  }

  const filenameLabel = [
    filename || "파일명",
    saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <WorkflowLayout
      step="images"
      projectTitle="프로젝트 이름"
      filename={filenameLabel}
      error={error || undefined}
    >
      <div className="flex-1 flex flex-col min-h-0 px-5 pt-2 pb-5">
        <div className="grid grid-cols-2 gap-4 mb-2 shrink-0">
          {id ? (
            <Link
              to={`/documents/${id}/translate`}
              className="inline-flex items-center gap-1 h-10 px-2 text-coolgray-60 hover:text-primary-60 font-medium text-base w-fit"
            >
              <IconChevronLeft className="size-6" />
              번역
            </Link>
          ) : (
            <span />
          )}
          {id ? (
            <Link
              to={`/documents/${id}/export`}
              className="inline-flex items-center gap-1 h-10 px-2 text-primary-60 hover:underline font-medium text-base justify-self-end"
            >
              추출
              <IconChevronRight className="size-6" />
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          <PanePanel title="이지리드" className="min-h-[480px]">
            <div className="flex-1 min-h-0 overflow-auto -mx-4 -mb-4 px-4 pb-4">
              {segments.length === 0 ? (
                <p className="text-base text-coolgray-60">번역을 먼저 생성해 주세요.</p>
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

          <div className="flex flex-col min-h-0 gap-4">
            <PanePanel title="그림 DB" className="flex-1 min-h-[360px]">
              <input
                type="search"
                placeholder="제목 또는 파일명 검색"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                className="w-full mb-3 h-10 px-3 bg-coolgray-10 border-b border-coolgray-30 text-sm outline-none focus:border-primary-60 shrink-0"
              />
              <div className="flex-1 min-h-0 overflow-auto -mx-4 -mb-4 px-4 pb-4">
                {catalogLoading ? (
                  <p className="text-base text-coolgray-60">불러오는 중...</p>
                ) : catalogItems.length === 0 ? (
                  <p className="text-base text-coolgray-60">검색 결과가 없습니다.</p>
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

            <div className="shrink-0 pt-2">
              <PromptBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={applyPrompt}
                loading={loading}
              />
            </div>
          </div>
        </div>
      </div>
    </WorkflowLayout>
  );
}
