/**
 * 이지리드 번역 편집 페이지 (워크플로 3단계) — Figma 번역 최종 UI.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ImagePlacement, TranslationSegment } from "../api/client";
import {
  detectImagePlacements,
  getDocument,
  refineTranslation,
  translate,
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
import {
  getWorkflowSnapshot,
  resolveSummary,
  resolveTranslationSegments,
  saveWorkflowSnapshot,
} from "../utils/workflowCache";

function sanitizeSegments(segments: TranslationSegment[]): TranslationSegment[] {
  return segments.map((s) => ({
    ...s,
    easy_text: s.easy_text ? sanitizeTranslationText(s.easy_text) : s.easy_text,
  }));
}

export function TranslatePage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState("");
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    const workflow = getWorkflowSnapshot(id);

    try {
      const doc = await getDocument(id);
      setFilename(doc.filename);
      setSummary(resolveSummary(id, doc.summary));
      const resolved = resolveTranslationSegments(id, doc.translation_segments);
      if (resolved.length) {
        let segs = sanitizeSegments(resolved);
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
            /* ignore detect errors for legacy docs */
          }
        }
        setSegments(segs);
        saveWorkflowSnapshot(id, {
          translation_segments: segs,
          translation_text: doc.translation_text ?? workflow?.translation_text,
          filename: doc.filename,
        });
      } else {
        setLoading(true);
        try {
          const updated = await translate(id);
          const segs = sanitizeSegments(updated.translation_segments);
          setSegments(segs);
          saveWorkflowSnapshot(id, {
            translation_segments: segs,
            translation_text: updated.translation_text ?? undefined,
            filename: updated.filename,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "번역 생성 실패");
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      const cachedSegments = workflow?.translation_segments ?? [];
      if (cachedSegments.length) {
        setFilename(workflow?.filename ?? "");
        setSummary(workflow?.summary ?? "");
        setSegments(sanitizeSegments(cachedSegments));
        return;
      }
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다");
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const persistTranslation = useCallback(async () => {
    if (!id || segments.length === 0) return;
    setSaveStatus("saving");
    try {
      const cached = getCachedUpload(id);
      await updateTranslation(id, segments, ensurePayload(cached));
      saveWorkflowSnapshot(id, {
        translation_segments: segments,
        translation_text: segments.map((s) => s.easy_text).filter(Boolean).join("\n\n"),
      });
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
      const segs = sanitizeSegments(doc.translation_segments);
      setSegments(segs);
      saveWorkflowSnapshot(id, {
        translation_segments: segs,
        translation_text: doc.translation_text ?? undefined,
      });
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
      step="translate"
      docId={id}
      projectTitle="프로젝트 이름"
      filename={filenameLabel}
      error={error || undefined}
    >
      <div className="flex-1 flex flex-col min-h-0 px-5 pt-2 pb-5">
        <div className="grid grid-cols-2 gap-4 mb-2 shrink-0">
          {id ? (
            <Link
              to={`/documents/${id}/summary`}
              className="inline-flex items-center gap-1 h-10 px-2 text-coolgray-60 hover:text-primary-60 font-medium text-base w-fit"
            >
              <IconChevronLeft className="size-6" />
              요약
            </Link>
          ) : (
            <span />
          )}
          {id ? (
            <Link
              to={`/documents/${id}/images`}
              className="inline-flex items-center gap-1 h-10 px-2 text-primary-60 hover:underline font-medium text-base justify-self-end"
            >
              그림
              <IconChevronRight className="size-6" />
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          <PanePanel title="요약문" className="min-h-[480px]">
            <pre className="flex-1 overflow-auto whitespace-pre-wrap text-base p-0 bg-white leading-relaxed min-h-0">
              {summary || "(요약문 없음)"}
            </pre>
          </PanePanel>

          <div className="flex flex-col min-h-0 gap-4">
            <PanePanel title="번역문" className="flex-1 min-h-[360px]">
              <div
                className={`flex-1 min-h-0 flex flex-col -mx-4 -mb-4 px-4 pb-4 ${
                  segments.length === 1 ? "overflow-hidden" : "overflow-auto gap-2"
                }`}
              >
                {loading && segments.length === 0 ? (
                  <p className="text-base text-coolgray-60">번역 생성 중...</p>
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
