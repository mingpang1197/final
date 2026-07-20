/**
 * 그림 배치 페이지 (워크플로 4단계) — Figma 그림 80% ERAI UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { ImageCatalogItem, ImagePlacement, TranslationSegment } from "../api/client";
import {
  detectImagePlacements,
  getImageCatalog,
  searchWebImages,
  updateTranslation,
} from "../api/client";
import { DraggableCatalogItem, EasyReadDocumentView } from "../components/EasyReadDocumentView";
import { PromptBar } from "../components/PromptBar";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { buildEnsureContext, loadDocumentWithRecovery } from "../utils/documentLoader";
import { sanitizeTranslationText } from "../utils/sanitizeTranslation";
import { useDebouncedSave } from "../utils/useDebouncedSave";
import {
  getWorkflowSnapshot,
  resolveTranslationSegments,
  saveWorkflowSnapshot,
} from "../utils/workflowCache";

function sanitizeSegments(segments: TranslationSegment[]): TranslationSegment[] {
  return segments.map((s) => ({
    ...s,
    easy_text: s.easy_text ? sanitizeTranslationText(s.easy_text) : s.easy_text,
  }));
}

function segmentsToText(segments: TranslationSegment[]): string {
  return segments.map((s) => s.easy_text).filter(Boolean).join("\n\n");
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
  const [prompt, setPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [webSearchActive, setWebSearchActive] = useState(false);

  const mainSegment = segments[0];
  const translationText = useMemo(() => segmentsToText(segments), [segments]);
  const placements = mainSegment?.image_placements ?? [];

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    const workflow = getWorkflowSnapshot(id);
    const ensure = buildEnsureContext(id);

    try {
      const doc = await loadDocumentWithRecovery(id);
      setFilename(doc.filename);
      let segs = sanitizeSegments(resolveTranslationSegments(id, doc.translation_segments));
      const main = segs[0];
      if (main?.easy_text && !(main.image_placements?.length ?? 0)) {
        try {
          const detected = await detectImagePlacements(id, ensure);
          if (detected.length) {
            segs = segs.map((s, i) =>
              i === 0 ? { ...s, image_placements: detected } : s,
            );
          }
        } catch {
          /* ignore */
        }
      }
      setSegments(segs);
      if (segs.length) {
        saveWorkflowSnapshot(id, { translation_segments: segs, filename: doc.filename });
      }
    } catch (err) {
      const cachedSegments = workflow?.translation_segments ?? [];
      if (cachedSegments.length) {
        setFilename(workflow?.filename ?? "");
        setSegments(sanitizeSegments(cachedSegments));
        return;
      }
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다");
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (webSearchActive) return;
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
  }, [catalogQuery, webSearchActive]);

  const persistTranslation = useCallback(async () => {
    if (!id || segments.length === 0) return;
    setSaveStatus("saving");
    try {
      const ensure = buildEnsureContext(id);
      if (ensure) {
        await updateTranslation(id, segments, ensure);
      } else {
        await updateTranslation(id, segments);
      }
      saveWorkflowSnapshot(id, { translation_segments: segments });
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }, [id, segments]);

  const { flush: flushTranslationSave } = useDebouncedSave(segments, persistTranslation);

  async function applyImagePrompt() {
    if (!prompt.trim()) return;
    setPromptLoading(true);
    setError("");
    setWebSearchActive(true);
    try {
      const results = await searchWebImages(prompt.trim());
      setCatalogItems(results.slice(0, 40));
      if (results.length === 0) {
        setError("웹에서 찾은 그림이 없습니다. 다른 키워드로 시도해 보세요.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "웹 그림 검색 실패");
    } finally {
      setPromptLoading(false);
    }
  }

  function handleCatalogSearchChange(value: string) {
    setCatalogQuery(value);
    setWebSearchActive(false);
    setError("");
  }

  useEffect(() => {
    return () => {
      void flushTranslationSave();
    };
  }, [flushTranslationSave]);

  function editPlacements(next: ImagePlacement[]) {
    if (!mainSegment) return;
    setSegments((prev) =>
      prev.map((s) => (s.id === mainSegment.id ? { ...s, image_placements: next } : s)),
    );
  }

  const filenameLabel = [
    filename || "파일명",
    saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const translationPlaceholder = translationText.trim() ? "" : "번역 결과";

  return (
    <WorkflowLayout
      step="images"
      docId={id}
      headerVariant="compact"
      projectTitle={
        <>
          ER<span className="text-primary-60">AI</span>
        </>
      }
      filename={filenameLabel}
      error={error || undefined}
    >
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0 overflow-hidden px-5 pt-4 pb-5">
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <p className="text-center text-base text-primary-90 shrink-0">번역문</p>
          <div className="flex-1 min-h-0 flex flex-col border border-coolgray-40 overflow-hidden bg-white">
            {segments.length === 0 ? (
              <pre className="flex-1 min-h-0 w-full px-4 py-3 text-base overflow-auto whitespace-pre-wrap leading-relaxed text-coolgray-60 text-center flex items-center justify-center">
                {translationPlaceholder}
              </pre>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                <EasyReadDocumentView
                  text={translationText}
                  placements={placements}
                  mode="images"
                  fill
                  onPlacementsChange={editPlacements}
                />
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <p className="text-center text-base text-primary-90 shrink-0">그림 DB</p>

          <div className="flex-1 min-h-0 flex flex-col border border-coolgray-40 overflow-hidden bg-coolgray-10">
            <input
              type="search"
              placeholder="제목 또는 파일명 검색"
              value={catalogQuery}
              onChange={(e) => handleCatalogSearchChange(e.target.value)}
              className="w-full h-12 px-4 bg-coolgray-10 border-b border-coolgray-30 text-base text-coolgray-90 placeholder:text-coolgray-60 outline-none focus:border-primary-60 shrink-0"
            />
            <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
              {webSearchActive && (
                <p className="text-xs text-primary-60 mb-2 text-center">
                  AI 프롬프트 웹 검색 결과 · 그림 DB로 돌아가려면 위 검색창을 사용하세요
                </p>
              )}
              {catalogLoading ? (
                <p className="text-base text-coolgray-60 text-center py-8">불러오는 중...</p>
              ) : catalogItems.length === 0 ? (
                <p className="text-base text-coolgray-60 text-center py-8">검색 결과가 없습니다.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3">
                  {catalogItems.map((item) => (
                    <DraggableCatalogItem key={item.image_file} item={item}>
                      <img
                        src={item.url}
                        alt={item.title}
                        className="mx-auto h-24 w-full object-contain pointer-events-none"
                      />
                      <p className="mt-2 text-xs text-coolgray-90 line-clamp-2 text-center pointer-events-none">
                        {item.title}
                      </p>
                    </DraggableCatalogItem>
                  ))}
                </ul>
              )}
            </div>

            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-coolgray-30 bg-coolgray-10">
              <PromptBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={applyImagePrompt}
                loading={promptLoading}
                placeholder="찾을 그림을 설명하세요 (예: 각하, 징역, 무죄)"
              />
            </div>
          </div>
        </div>
      </div>
    </WorkflowLayout>
  );
}
