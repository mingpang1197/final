/**
 * Word 출력 페이지 (워크플로 5단계) — Figma 출력 UI.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ChecklistReport, TranslationSegment } from "../api/client";
import {
  downloadDocx,
  runChecklist,
} from "../api/client";
import { ChecklistPanel } from "../components/ChecklistPanel";
import { IconChevronLeft } from "../components/ui/icons";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { getCachedUpload } from "../utils/docCache";
import { loadDocumentWithRecovery } from "../utils/documentLoader";
import { sanitizeTranslationText } from "../utils/sanitizeTranslation";
import {
  getWorkflowSnapshot,
  resolveSummary,
  resolveTranslationSegments,
} from "../utils/workflowCache";

export function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [filename, setFilename] = useState("");
  const [summary, setSummary] = useState("");
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [previewText, setPreviewText] = useState("");
  const [checklist, setChecklist] = useState<ChecklistReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const doc = await loadDocumentWithRecovery(id);
      setFilename(doc.filename);
      setSummary(resolveSummary(id, doc.summary));
      const segs = resolveTranslationSegments(id, doc.translation_segments);
      setSegments(segs);
      const text =
        doc.translation_text ||
        segs.map((s) => s.easy_text).filter(Boolean).join("\n\n");
      setPreviewText(text ? sanitizeTranslationText(text) : "");
      if (doc.checklist) {
        setChecklist(doc.checklist);
      } else if (segs.length > 0) {
        setLoading(true);
        try {
          const report = await runChecklist(id);
          setChecklist(report);
        } catch (err) {
          setError(err instanceof Error ? err.message : "체크리스트 검사 실패");
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      const workflow = getWorkflowSnapshot(id);
      const cached = getCachedUpload(id);
      const segs = resolveTranslationSegments(id, workflow?.translation_segments ?? []);
      if (segs.length) {
        setFilename(workflow?.filename ?? cached?.filename ?? "");
        setSummary(resolveSummary(id, workflow?.summary));
        setSegments(segs);
        const text =
          workflow?.translation_text ??
          segs.map((s) => s.easy_text).filter(Boolean).join("\n\n");
        setPreviewText(text ? sanitizeTranslationText(text) : "");
        return;
      }
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다");
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function handleRecheck() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const report = await runChecklist(id);
      setChecklist(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "체크리스트 검사 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!id || segments.length === 0) return;
    setExporting(true);
    setError("");
    try {
      const cached = getCachedUpload(id);
      await downloadDocx(id, {
        segments,
        summary,
        filename,
        doc_type: cached?.doc_type,
        full_text: cached?.full_text,
        pages: cached?.pages,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Word 출력 실패");
    } finally {
      setExporting(false);
    }
  }

  return (
    <WorkflowLayout
      step="export"
      docId={id}
      projectTitle="프로젝트 이름"
      filename={filename || "파일명"}
      error={error || undefined}
    >
      <div className="flex-1 flex flex-col min-h-0 px-5 pt-2 pb-6">
        {id && (
          <Link
            to={`/documents/${id}/images`}
            className="inline-flex items-center gap-1 h-10 px-2 mb-2 text-coolgray-60 hover:text-primary-60 font-medium text-base w-fit shrink-0"
          >
            <IconChevronLeft className="size-6" />
            그림
          </Link>
        )}

        <div className="flex-1 flex flex-col items-center gap-5 min-h-0">
          <details className="w-full max-w-[1025px] shrink-0 group">
            <summary className="text-sm text-coolgray-60 cursor-pointer hover:text-primary-60 list-none flex items-center gap-1">
              <span className="group-open:rotate-90 transition-transform inline-block">›</span>
              품질 체크리스트
              {checklist && (
                <span className="text-coolgray-40">
                  (통과 {checklist.summary.pass} · 주의 {checklist.summary.warn} · 수정{" "}
                  {checklist.summary.fail})
                </span>
              )}
            </summary>
            <div className="mt-2">
              <ChecklistPanel checklist={checklist} onRecheck={handleRecheck} loading={loading} />
            </div>
          </details>

          <div className="w-full max-w-[1025px] flex-1 min-h-[420px] border border-coolgray-40 bg-white overflow-auto">
            <pre className="p-6 text-base whitespace-pre-wrap leading-relaxed text-coolgray-90 min-h-full">
              {previewText || "(번역 내용이 없습니다)"}
            </pre>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || segments.length === 0}
            className="w-[317px] h-12 shrink-0 bg-primary-60 border-2 border-primary-60 text-white text-xl font-medium hover:bg-primary-90 disabled:opacity-50 transition-colors"
          >
            {exporting ? "출력 중..." : "추출하기"}
          </button>
        </div>
      </div>
    </WorkflowLayout>
  );
}
