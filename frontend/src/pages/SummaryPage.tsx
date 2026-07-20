/**
 * AI 요약 편집 페이지 (워크플로 2단계) — Figma UI.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  type DocType,
  DOC_TYPE_LABELS,
  getDocument,
  getPage,
  refineSummary,
  summarize,
  updateDocType,
  updateSummary,
} from "../api/client";
import { PageNavigator } from "../components/PageNavigator";
import { PromptBar } from "../components/PromptBar";
import { A4Sheet } from "../components/ui/A4Sheet";
import { DocTypePills } from "../components/ui/DocTypePills";
import { PanePanel } from "../components/ui/PanePanel";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
import {
  ensurePayload,
  getCachedUpload,
  summarizeFallbackBody,
} from "../utils/docCache";
import { useDebouncedSave } from "../utils/useDebouncedSave";

function getFileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function canPreviewSource(filename: string, mimeType?: string): boolean {
  const ext = getFileExt(filename);
  if (mimeType?.startsWith("image/")) return true;
  return ["pdf", "txt", "png", "jpg", "jpeg", "doc", "docx", "hwp", "hwpx"].includes(ext);
}

export function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [originalPage, setOriginalPage] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceFilename, setSourceFilename] = useState<string>("");
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const [docType, setDocType] = useState<DocType>("unknown");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function loadDocumentWithRetry(docId: string) {
    let lastErr: unknown;
    for (let i = 0; i < 5; i += 1) {
      try {
        return await getDocument(docId);
      } catch (err) {
        lastErr = err;
        await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
      }
    }
    throw lastErr;
  }

  const persistSummary = useCallback(async () => {
    if (!id || !summary.trim()) return;
    setSaveStatus("saving");
    try {
      const cached = getCachedUpload(id);
      await updateSummary(id, summary, ensurePayload(cached));
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }, [id, summary]);

  useDebouncedSave(summary, persistSummary);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    const cached = getCachedUpload(id);

    try {
      const doc = await loadDocumentWithRetry(id);
      setFilename(doc.filename);
      setDocType(doc.doc_type);
      setPageCount(doc.page_count);
      setSummary(doc.summary || "");
      if (!doc.summary) {
        setLoading(true);
        try {
          const updated = await summarize(
            id,
            false,
            cached ? summarizeFallbackBody(cached) : undefined,
          );
          setSummary(updated.summary || "");
        } catch (err) {
          setError(err instanceof Error ? err.message : "요약 생성 실패");
        } finally {
          setLoading(false);
        }
      }
    } catch {
      if (cached) {
        setFilename(cached.filename);
        setDocType(cached.doc_type);
        setPageCount(cached.page_count);
        setLoading(true);
        try {
          const updated = await summarize(id, false, summarizeFallbackBody(cached));
          setSummary(updated.summary || "");
        } catch (err) {
          setError(err instanceof Error ? err.message : "요약 생성 실패");
        } finally {
          setLoading(false);
        }
      } else {
        setError("문서를 불러오지 못했습니다. 잠시 후 자동으로 다시 시도하거나 새로고침해 주세요.");
      }
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const cached = getCachedUpload(id);
    const previewName = filename || cached?.filename || "";
    setSourceFilename(previewName);
    setSourceReady(false);

    const loadTextFallback = () => {
      if (cached?.pages?.length) {
        setOriginalPage(cached.pages[pageNum - 1] || "");
        return;
      }
      getPage(id, pageNum)
        .then(setOriginalPage)
        .catch(() => setOriginalPage("(페이지를 불러오지 못했습니다)"));
    };

    const serverUrl = `/api/documents/${id}/source`;
    fetch(serverUrl, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          setSourcePreviewUrl(serverUrl);
          setSourceReady(true);
          return;
        }
        if (previewName && cached?.source_blob_url && canPreviewSource(previewName, cached?.source_mime_type)) {
          setSourcePreviewUrl(cached.source_blob_url);
          setSourceReady(true);
          return;
        }
        setSourcePreviewUrl(null);
        loadTextFallback();
      })
      .catch(() => {
        if (previewName && cached?.source_blob_url && canPreviewSource(previewName, cached?.source_mime_type)) {
          setSourcePreviewUrl(cached.source_blob_url);
          setSourceReady(true);
          return;
        }
        setSourcePreviewUrl(null);
        loadTextFallback();
      });
  }, [id, pageNum, filename]);

  async function applyPrompt() {
    if (!id || !prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const doc = await refineSummary(id, prompt);
      setSummary(doc.summary || "");
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 수정 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleDocTypeChange(next: Exclude<DocType, "unknown">) {
    if (!id || next === docType || loading) return;
    const label = DOC_TYPE_LABELS[next];
    const currentLabel =
      docType !== "unknown" ? DOC_TYPE_LABELS[docType as Exclude<DocType, "unknown">] : "미분류";
    const ok = window.confirm(
      `사건 유형을 「${currentLabel}」에서 「${label}」(으)로 변경하고 요약을 다시 생성할까요?`,
    );
    if (!ok) return;

    setLoading(true);
    setError("");
    try {
      await updateDocType(id, next);
      setDocType(next);
      const cached = getCachedUpload(id);
      const updated = await summarize(
        id,
        true,
        cached ? summarizeFallbackBody(cached) : undefined,
      );
      setSummary(updated.summary || "");
      setDocType(updated.doc_type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "유형 변경 또는 요약 재생성 실패");
    } finally {
      setLoading(false);
    }
  }

  const saveLabel =
    saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨" : "";

  return (
    <WorkflowLayout
      step="summary"
      filename={filename ? `${filename}${saveLabel ? ` · ${saveLabel}` : ""}` : undefined}
      prevNav={id ? { label: "업로드", to: "/" } : undefined}
      nextNav={id ? { label: "번역", to: `/documents/${id}/translate` } : undefined}
      error={error || undefined}
    >
      <DocTypePills active={docType} disabled={loading} onChange={handleDocTypeChange} />

      <div className="flex-1 grid grid-cols-2 gap-3 p-3 min-h-0 h-full">
        <PanePanel title="원문">
          <div className="flex flex-col flex-1 min-h-0 gap-1">
            {!sourcePreviewUrl || !sourceReady ? (
              <PageNavigator current={pageNum} total={pageCount} onChange={setPageNum} />
            ) : null}
            <A4Sheet>
              {sourcePreviewUrl && sourceReady ? (
                <iframe
                  title="업로드 원문"
                  src={sourcePreviewUrl}
                  className="w-full h-full min-h-0 border-0 block"
                />
              ) : (
                <pre className="a4-sheet-body whitespace-pre-wrap">{originalPage}</pre>
              )}
            </A4Sheet>
            {sourcePreviewUrl && sourceReady ? (
              <div className="shrink-0 px-1 py-0.5 text-xs text-coolgray-60 flex justify-between">
                <span className="truncate">{sourceFilename || filename}</span>
                <a
                  href={sourcePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-60 hover:underline shrink-0"
                >
                  새 탭
                </a>
              </div>
            ) : null}
          </div>
        </PanePanel>

        <PanePanel title="요약문">
          <div className="flex flex-col flex-1 min-h-0">
            <A4Sheet>
              <textarea
                className="w-full h-full min-h-0 resize-none overflow-auto border-0 outline-none bg-transparent p-5 text-[15px] leading-[1.75] text-coolgray-90"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={loading ? "요약 생성 중..." : ""}
              />
            </A4Sheet>
            <div className="shrink-0 mt-2 pt-2 border-t border-coolgray-20">
              <PromptBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={applyPrompt}
                loading={loading}
              />
            </div>
          </div>
        </PanePanel>
      </div>
    </WorkflowLayout>
  );
}
