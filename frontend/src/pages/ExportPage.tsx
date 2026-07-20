/**
 * PDF 추출 페이지 (워크플로 5단계) — Figma 추출 80% ERAI UI.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TranslationSegment } from "../api/client";
import { downloadDocx, downloadPdf, fetchExportDocx } from "../api/client";
import { DocxPreviewPanel } from "../components/DocxPreviewPanel";
import { IconArrowRight } from "../components/ui/icons";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import { getCachedUpload } from "../utils/docCache";
import { enrichSegmentsForExport } from "../utils/exportImages";
import { loadDocumentWithRecovery } from "../utils/documentLoader";
import {
  getWorkflowSnapshot,
  resolveSummary,
  resolveTranslationSegments,
  saveWorkflowSnapshot,
} from "../utils/workflowCache";

export function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [filename, setFilename] = useState("");
  const [summary, setSummary] = useState("");
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
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
      if (segs.length) {
        saveWorkflowSnapshot(id, { translation_segments: segs, filename: doc.filename });
      }
    } catch (err) {
      const workflow = getWorkflowSnapshot(id);
      const cached = getCachedUpload(id);
      const segs = resolveTranslationSegments(id, workflow?.translation_segments ?? []);
      if (segs.length) {
        setFilename(workflow?.filename ?? cached?.filename ?? "");
        setSummary(resolveSummary(id, workflow?.summary));
        setSegments(segs);
        return;
      }
      setError(err instanceof Error ? err.message : "문서를 불러오지 못했습니다");
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const buildExportPayload = useCallback(async () => {
    const cached = id ? getCachedUpload(id) : null;
    const workflow = id ? getWorkflowSnapshot(id) : null;
    const cachedSegments = workflow?.translation_segments ?? [];
    const hasPlacements = cachedSegments.some(
      (s) => (s.image_placements?.length ?? 0) > 0,
    );
    const baseSegments = hasPlacements ? cachedSegments : segments;
    const mergedSegments = id
      ? resolveTranslationSegments(id, baseSegments)
      : baseSegments;
    const exportSegments = await enrichSegmentsForExport(mergedSegments);
    return {
      segments: exportSegments,
      translation_text: exportSegments.map((s) => s.easy_text).filter(Boolean).join("\n\n"),
      summary,
      filename,
      doc_type: cached?.doc_type,
      full_text: cached?.full_text,
      pages: cached?.pages,
    };
  }, [id, segments, summary, filename]);

  useEffect(() => {
    if (!id || segments.length === 0) {
      setPreviewBlob(null);
      setPreviewReady(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewReady(false);
    setError("");

    buildExportPayload()
      .then((payload) => fetchExportDocx(id, payload))
      .then((blob) => {
        if (!cancelled) setPreviewBlob(blob);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Word 미리보기 생성 실패");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, segments, buildExportPayload]);

  async function handleExportWord() {
    if (!id || segments.length === 0) return;
    setExportingWord(true);
    setError("");
    try {
      const payload = await buildExportPayload();
      await downloadDocx(id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Word 추출 실패");
    } finally {
      setExportingWord(false);
    }
  }

  async function handleExportPdf() {
    if (!id || segments.length === 0 || !previewReady) return;
    setExporting(true);
    setError("");
    try {
      const payload = await buildExportPayload();
      try {
        await downloadPdf(id, payload);
        return;
      } catch {
        // Vercel 등 Word/LibreOffice 없는 서버 — 브라우저 Print to PDF
      }
      window.print();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 추출 실패");
    } finally {
      setExporting(false);
    }
  }

  return (
    <WorkflowLayout
      step="export"
      docId={id}
      headerVariant="compact"
      projectTitle={
        <>
          ER<span className="text-primary-60">AI</span>
        </>
      }
      filename={filename || "파일명"}
      error={error || undefined}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-5 pt-4 pb-5">
        <div className="flex-1 flex flex-col items-center gap-4 min-h-0 overflow-hidden w-full max-w-[916px] mx-auto">
          <div className="w-full flex-1 min-h-0 border border-coolgray-30 overflow-hidden rounded-sm shadow-inner bg-[#e8e8e8]">
            {previewLoading ? (
              <div className="h-full flex items-center justify-center text-coolgray-60 text-base">
                Word 미리보기 생성 중...
              </div>
            ) : previewBlob ? (
              <DocxPreviewPanel
                blob={previewBlob}
                onReady={() => setPreviewReady(true)}
                onError={(message) => setError(message)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-coolgray-60 text-base px-6 text-center">
                {segments.length === 0
                  ? "번역 내용이 없어 미리보기를 생성할 수 없습니다."
                  : "Word 미리보기를 불러올 수 없습니다."}
              </div>
            )}
          </div>

          <p className="text-center text-sm text-coolgray-60 shrink-0 max-w-[720px]">
            미리보기는 <strong className="font-medium text-coolgray-80">Word(.docx)</strong> 기준입니다.
            PDF 추출은 서버에 Word가 있으면 자동 저장, 없으면{" "}
            <strong className="font-medium text-coolgray-80">브라우저 인쇄 → Microsoft Print to PDF</strong>
            를 사용합니다.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 shrink-0 w-full max-w-[720px]">
            <button
              type="button"
              onClick={handleExportWord}
              disabled={exportingWord || previewLoading || segments.length === 0}
              className="inline-flex h-14 min-w-[220px] flex-1 items-center justify-center gap-2 bg-primary-60 border-2 border-primary-60 px-4 text-white text-xl font-medium tracking-wide hover:bg-primary-90 disabled:opacity-50 transition-colors"
            >
              {exportingWord ? "추출 중..." : "Word 추출하기"}
              <IconArrowRight className="size-6 text-white" />
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting || previewLoading || !previewReady || segments.length === 0}
              className="inline-flex h-14 min-w-[220px] flex-1 items-center justify-center gap-2 border-2 border-primary-60 px-4 text-primary-60 text-xl font-medium tracking-wide hover:bg-primary-60/5 disabled:opacity-50 transition-colors"
            >
              {exporting ? "추출 중..." : "PDF 추출하기"}
              <IconArrowRight className="size-6 text-primary-60" />
            </button>
            <Link
              to="/"
              className="inline-flex h-14 min-w-[220px] flex-1 items-center justify-center border-2 border-coolgray-40 px-4 text-coolgray-70 text-xl font-medium tracking-wide hover:bg-coolgray-10 transition-colors text-center"
            >
              업로드 화면으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </WorkflowLayout>
  );
}
