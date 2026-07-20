/**
 * Word 출력 페이지 (워크플로 5단계) — Figma UI.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ChecklistReport, TranslationSegment } from "../api/client";
import {
  downloadDocx,
  getDocument,
  runChecklist,
} from "../api/client";
import { ChecklistPanel } from "../components/ChecklistPanel";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { getCachedUpload } from "../utils/docCache";
import { sanitizeTranslationText } from "../utils/sanitizeTranslation";

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
    const doc = await getDocument(id);
    setFilename(doc.filename);
    setSummary(doc.summary || "");
    setSegments(doc.translation_segments);
    const text =
      doc.translation_text ||
      doc.translation_segments.map((s) => s.easy_text).filter(Boolean).join("\n\n");
    setPreviewText(text ? sanitizeTranslationText(text) : "");
    if (doc.checklist) {
      setChecklist(doc.checklist);
    } else {
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
      filename={filename}
      prevNav={id ? { label: "그림", to: `/documents/${id}/images` } : undefined}
      error={error || undefined}
    >
      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0 overflow-hidden">
        <ChecklistPanel checklist={checklist} onRecheck={handleRecheck} loading={loading} />

        <div className="flex-1 min-h-0 border border-coolgray-40 rounded bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-coolgray-20 bg-coolgray-10">
            <h2 className="text-sm font-medium text-coolgray-90">미리보기</h2>
          </div>
          <pre className="flex-1 overflow-auto p-4 text-sm whitespace-pre-wrap leading-relaxed text-coolgray-90">
            {previewText || "(번역 내용이 없습니다)"}
          </pre>
        </div>

        <div className="flex justify-center shrink-0 pb-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || segments.length === 0}
            className="w-72 h-11 bg-primary-60 border-2 border-primary-60 text-white text-base font-medium rounded-lg hover:bg-primary-90 disabled:opacity-50 transition-colors"
          >
            {exporting ? "출력 중..." : "추출하기"}
          </button>
        </div>
      </div>
    </WorkflowLayout>
  );
}
