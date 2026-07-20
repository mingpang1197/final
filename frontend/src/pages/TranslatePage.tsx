/**
 * 이지리드 번역 편집 페이지 (워크플로 3단계) — Figma 번역 80% ERAI UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { TranslationSegment } from "../api/client";
import {
  refineTranslation,
  translate,
  updateTranslation,
} from "../api/client";
import { PromptBar } from "../components/PromptBar";
import { EasyReadDocumentView } from "../components/EasyReadDocumentView";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { buildEnsureContext, loadDocumentWithRecovery } from "../utils/documentLoader";
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

function segmentsToText(segments: TranslationSegment[]): string {
  return segments.map((s) => s.easy_text).filter(Boolean).join("\n\n");
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

  const translationText = useMemo(() => segmentsToText(segments), [segments]);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    const workflow = getWorkflowSnapshot(id);
    const ensure = buildEnsureContext(id);

    try {
      const doc = await loadDocumentWithRecovery(id);
      setFilename(doc.filename);
      setSummary(resolveSummary(id, doc.summary));
      const resolved = resolveTranslationSegments(id, doc.translation_segments);
      if (resolved.length) {
        const segs = sanitizeSegments(resolved);
        setSegments(segs);
        saveWorkflowSnapshot(id, {
          translation_segments: segs,
          translation_text: doc.translation_text ?? workflow?.translation_text,
          filename: doc.filename,
        });
      } else {
        setLoading(true);
        try {
          const updated = await translate(id, ensure);
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
      const ensure = buildEnsureContext(id);
      if (ensure) {
        await updateTranslation(id, segments, {
          ...ensure,
          summary: summary || ensure.summary,
        });
      } else {
        await updateTranslation(id, segments);
      }
      saveWorkflowSnapshot(id, {
        translation_segments: segments,
        translation_text: segmentsToText(segments),
      });
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }, [id, segments, summary]);

  useDebouncedSave(segments, persistTranslation);

  function editTranslationText(text: string) {
    if (segments.length === 0) return;
    if (segments.length === 1) {
      setSegments([{ ...segments[0], easy_text: text, source: "manual" as const }]);
      return;
    }
    setSegments(
      segments.map((s, i) =>
        i === 0 ? { ...s, easy_text: text, source: "manual" as const } : s,
      ),
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

  const summaryDisplay = summary.trim() || "";
  const summaryPlaceholder = summaryDisplay ? "" : "요약 결과";

  const translationPlaceholder =
    loading && segments.length === 0 ? "번역 생성 중..." : translationText.trim() ? "" : "번역 결과";

  return (
    <WorkflowLayout
      step="translate"
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
          <p className="text-center text-base text-primary-90 shrink-0">요약문</p>
          <div className="flex-1 min-h-0 flex flex-col border border-coolgray-40 overflow-hidden bg-white">
            <pre
              className={`flex-1 min-h-0 w-full px-4 py-3 text-base overflow-auto whitespace-pre-wrap leading-relaxed text-coolgray-90 ${
                summaryPlaceholder ? "text-coolgray-60 text-center flex items-center justify-center" : ""
              }`}
            >
              {summaryDisplay || summaryPlaceholder}
            </pre>
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <p className="text-center text-base text-primary-90 shrink-0">번역문</p>

          <div className="flex-1 min-h-0 flex flex-col border border-coolgray-40 overflow-hidden bg-coolgray-10">
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
              <EasyReadDocumentView
                text={translationText}
                mode="translate"
                fill
                placeholder={translationPlaceholder}
                disabled={loading && segments.length === 0}
                onTextChange={editTranslationText}
              />
            </div>
          </div>

          <div className="shrink-0">
            <PromptBar
              value={prompt}
              onChange={setPrompt}
              onSubmit={applyPrompt}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </WorkflowLayout>
  );
}
