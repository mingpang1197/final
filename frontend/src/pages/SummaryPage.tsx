/**
 * AI 요약 편집 페이지 (워크플로 2단계).
 *
 * 역할: 원문 미리보기와 요약본을 나란히 보여 주고 수정·저장·AI 보정을 지원한다.
 * 주요 기능: 자동 요약 생성, 디바운스 저장, 원본 iframe/텍스트 미리보기, AI refine.
 * 연관 파일: api/client.ts, components/PageNavigator.tsx, components/PromptBar.tsx, utils/docCache.ts
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  type DocType,
  DOC_TYPE_LABELS,
  DOC_TYPE_OPTIONS,
  getDocument,
  getPage,
  refineSummary,
  summarize,
  updateDocType,
  updateSummary,
} from "../api/client";
import { PageNavigator } from "../components/PageNavigator";
import { PromptBar } from "../components/PromptBar";
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
  const navigate = useNavigate();
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

  async function saveSummary() {
    await persistSummary();
  }

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

  const activeDocType = docType !== "unknown" ? docType : null;

  return (
    <div className="h-screen flex flex-col">
      {/* 상단: 제목, 저장 상태, 저장·번역 단계 이동 */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold">요약</h1>
          <p className="text-xs text-slate-500 truncate">
            {filename}
            {docType !== "unknown" && ` · ${DOC_TYPE_LABELS[docType as Exclude<DocType, "unknown">]}`}
            {saveStatus === "saving" && " · 저장 중..."}
            {saveStatus === "saved" && " · 저장됨"}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {DOC_TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={loading}
                onClick={() => handleDocTypeChange(value)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  activeDocType === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveSummary}
            className="px-3 py-1.5 text-sm border rounded-lg"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => id && navigate(`/documents/${id}/translate`)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
          >
            번역 단계 →
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 본문: 좌측 원문 / 우측 요약 2열 레이아웃 */}
      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        {/* 좌측 — 업로드 원본 미리보기 또는 페이지별 OCR 텍스트 */}
        <section className="flex flex-col border-r border-slate-200 p-4 bg-slate-50 min-h-0 overflow-hidden">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2">(원문)</h2>
          {sourcePreviewUrl && sourceReady ? (
            <div className="flex-1 min-h-0 bg-white border rounded-lg overflow-hidden flex flex-col">
              <iframe
                title="업로드 원문"
                src={sourcePreviewUrl}
                className="w-full h-full min-h-0 border-0 block"
              />
              <div className="px-3 py-2 border-t text-xs text-slate-500 flex items-center justify-between">
                <span className="truncate">{sourceFilename || filename}</span>
                <a
                  href={sourcePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline shrink-0"
                >
                  새 탭으로 열기
                </a>
              </div>
            </div>
          ) : (
            <>
              <PageNavigator current={pageNum} total={pageCount} onChange={setPageNum} />
              <pre className="flex-1 overflow-auto whitespace-pre-wrap text-sm p-3 bg-white border rounded-lg min-h-0">
                {originalPage}
              </pre>
            </>
          )}
        </section>

        {/* 우측 — 요약 편집 및 AI 프롬프트 */}
        <section className="flex flex-col p-4 min-h-0 overflow-hidden">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2 shrink-0">(요약본)</h2>
          <textarea
            className="flex-1 min-h-0 p-3 border border-slate-300 rounded-lg text-sm resize-none overflow-auto bg-white"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={loading ? "요약 생성 중..." : ""}
          />
          <div className="shrink-0 mt-3 pt-3 border-t border-slate-200">
            <PromptBar
              value={prompt}
              onChange={setPrompt}
              onSubmit={applyPrompt}
              loading={loading}
            />
          </div>
        </section>
      </div>

      <footer className="px-4 py-2 border-t text-xs text-slate-400">
        <Link to="/">← 업로드</Link>
      </footer>
    </div>
  );
}
