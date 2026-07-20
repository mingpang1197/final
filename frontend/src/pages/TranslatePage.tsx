/**
 * 이지리드 번역 편집 페이지 (워크플로 3단계) — Figma UI.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
import { PanePanel } from "../components/ui/PanePanel";
import { WorkflowLayout } from "../components/ui/WorkflowLayout";
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
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
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
      await updateTranslation(id, segments, ensurePayload(cached));
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
    try {
      const doc = await refineTranslation(id, prompt);
      setSegments(sanitizeSegments(doc.translation_segments));
      setPrompt("");
    } finally {
      setLoading(false);
    }
  }

  const saveLabel =
    saveStatus === "saving" ? "저장 중..." : saveStatus === "saved" ? "저장됨" : "";

  return (
    <WorkflowLayout
      step="translate"
      filename={filename ? `${filename}${saveLabel ? ` · ${saveLabel}` : ""}` : undefined}
      prevNav={id ? { label: "요약", to: `/documents/${id}/summary` } : undefined}
      nextNav={id ? { label: "그림", to: `/documents/${id}/images` } : undefined}
      error={error || undefined}
    >
      <div className="flex-1 grid grid-cols-2 gap-3 p-3 min-h-0 h-full">
        <PanePanel title="요약문">
          <pre className="flex-1 overflow-auto whitespace-pre-wrap text-sm p-3 bg-coolgray-10 border border-coolgray-20 rounded leading-relaxed">
            {summary}
          </pre>
        </PanePanel>

        <PanePanel title="번역문">
          <div
            className={`flex-1 min-h-0 flex flex-col ${
              segments.length === 1 ? "overflow-hidden" : "overflow-auto gap-2"
            }`}
          >
            {loading && segments.length === 0 ? (
              <p className="text-sm text-coolgray-60">번역 생성 중...</p>
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
          <div className="shrink-0 mt-3 pt-3 border-t border-coolgray-20">
            <PromptBar
              value={prompt}
              onChange={setPrompt}
              onSubmit={applyPrompt}
              loading={loading}
            />
          </div>
        </PanePanel>
      </div>
    </WorkflowLayout>
  );
}
