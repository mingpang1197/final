import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getDocument,
  getPage,
  refineSummary,
  summarize,
  updateSummary,
} from "../api/client";
import { PageNavigator } from "../components/PageNavigator";
import { PromptBar } from "../components/PromptBar";
import {
  getCachedUpload,
  summarizeFallbackBody,
} from "../utils/docCache";

export function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [originalPage, setOriginalPage] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    const cached = getCachedUpload(id);

    try {
      const doc = await getDocument(id);
      setFilename(doc.filename);
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
        setError("문서를 불러오지 못했습니다. 다시 업로드해 주세요.");
      }
    }
  }, [id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const cached = getCachedUpload(id);
    if (cached?.pages?.length) {
      setOriginalPage(cached.pages[pageNum - 1] || "");
      return;
    }
    getPage(id, pageNum)
      .then(setOriginalPage)
      .catch(() => setOriginalPage("(페이지를 불러오지 못했습니다)"));
  }, [id, pageNum]);

  async function saveSummary() {
    if (!id) return;
    await updateSummary(id, summary);
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

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div>
          <h1 className="font-semibold">요약</h1>
          <p className="text-xs text-slate-500">{filename}</p>
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

      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        <section className="flex flex-col border-r border-slate-200 p-4 bg-slate-50">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2">(원문)</h2>
          <PageNavigator current={pageNum} total={pageCount} onChange={setPageNum} />
          <pre className="flex-1 overflow-auto whitespace-pre-wrap text-sm p-3 bg-white border rounded-lg">
            {originalPage}
          </pre>
        </section>

        <section className="flex flex-col p-4 min-h-0">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2">(요약본)</h2>
          <textarea
            className="flex-[2] min-h-0 p-3 border border-slate-300 rounded-lg text-sm resize-none"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={loading ? "요약 생성 중..." : ""}
          />
          <div className="flex-[1] min-h-[120px] mt-3">
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
