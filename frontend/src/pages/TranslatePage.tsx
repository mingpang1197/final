import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ImagePlacement, TranslationSegment } from "../api/client";
import {
  detectImagePlacements,
  downloadDocx,
  getDocument,
  refineTranslation,
  translate,
  updateTranslation,
} from "../api/client";
import { PromptBar } from "../components/PromptBar";
import { TranslationSegmentView } from "../components/TranslationSegment";
import { ensurePayload, getCachedUpload } from "../utils/docCache";
import { sanitizeTranslationText } from "../utils/sanitizeTranslation";
import { useDebouncedSave } from "../utils/useDebouncedSave";

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
  const [exporting, setExporting] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const load = useCallback(async () => {
    if (!id) return;
    const doc = await getDocument(id);
    setFilename(doc.filename);
    setSummary(doc.summary || "");
    if (doc.translation_segments.length) {
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
          /* ignore detect errors for legacy docs */
        }
      }
      setSegments(segs);
    } else {
      setLoading(true);
      try {
        const updated = await translate(id);
        setSegments(sanitizeSegments(updated.translation_segments));
      } finally {
        setLoading(false);
      }
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
      const ensure = ensurePayload(cached);
      await updateTranslation(
        id,
        segments,
        ensure ? { ...ensure, summary: summary || undefined } : undefined,
      );
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }, [id, segments, summary]);

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

  async function saveTranslation() {
    await persistTranslation();
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

  async function applyPrompt() {
    if (!id || !prompt.trim()) return;
    setLoading(true);
    try {
      const doc = await refineTranslation(id, prompt);
      setSegments(sanitizeSegments(doc.translation_segments));
      setPrompt("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div>
          <h1 className="font-semibold">이지리드 번역</h1>
          <p className="text-xs text-slate-500">
            {filename}
            {saveStatus === "saving" && " · 저장 중..."}
            {saveStatus === "saved" && " · 저장됨"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveTranslation}
            className="px-3 py-1.5 text-sm border rounded-lg"
          >
            저장
          </button>
          {id && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || segments.length === 0}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50"
            >
              {exporting ? "출력 중..." : "Word 출력"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        <section className="flex flex-col border-r border-slate-200 p-4 bg-slate-50">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2">(요약본)</h2>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap text-sm p-3 bg-white border rounded-lg">
            {summary}
          </pre>
        </section>

        <section className="flex flex-col p-4 min-h-0 overflow-hidden">
          <h2 className="text-center text-sm font-medium text-slate-500 mb-2 shrink-0">(번역본)</h2>
          <div
            className={`flex-1 min-h-0 flex flex-col ${
              segments.length === 1 ? "overflow-hidden" : "overflow-auto gap-2"
            }`}
          >
            {loading && segments.length === 0 ? (
              <p className="text-sm text-slate-500">번역 생성 중...</p>
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

      <footer className="px-4 py-2 border-t text-xs text-slate-400 flex gap-4">
        <Link to="/">← 업로드</Link>
        {id && <Link to={`/documents/${id}/summary`}>← 요약</Link>}
      </footer>
    </div>
  );
}
