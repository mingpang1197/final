import { useCallback, useEffect, useRef, useState } from "react";
import {
  FONT_SIZE_OPTIONS,
  htmlToMarkers,
  markersToHtml,
  type FontSizePt,
} from "../utils/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  minHeight = "120px",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedValueRef = useRef("");
  const initializedRef = useRef(false);
  const [fontSize, setFontSize] = useState<FontSizePt>(12);

  const syncFromDom = useCallback(() => {
    if (!editorRef.current) return;
    const markers = htmlToMarkers(editorRef.current.innerHTML);
    savedValueRef.current = markers;
    onChange(markers);
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (!initializedRef.current || value !== savedValueRef.current) {
      editorRef.current.innerHTML = markersToHtml(value);
      savedValueRef.current = value;
      initializedRef.current = true;
    }
  }, [value]);

  function keepSelection(action: () => void) {
    if (!editorRef.current || disabled) return;
    editorRef.current.focus();
    action();
    syncFromDom();
  }

  function applyBold() {
    keepSelection(() => {
      document.execCommand("bold");
    });
  }

  function applyFontSize(size: FontSizePt) {
    setFontSize(size);
    keepSelection(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.dataset.fontPt = String(size);

      try {
        range.surroundContents(span);
      } catch {
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
        sel.removeAllRanges();
        const next = document.createRange();
        next.selectNodeContents(span);
        sel.addRange(next);
      }
    });
  }

  function handleToolbarMouseDown(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div className="rounded-lg border border-coolgray-30 overflow-hidden bg-white">
      <div
        className="flex items-center gap-2 px-2 py-1.5 border-b border-coolgray-20 bg-coolgray-10"
        onMouseDown={handleToolbarMouseDown}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={applyBold}
          title="굵게 (B)"
          aria-label="굵게"
          className="min-w-8 h-8 px-2 rounded border border-coolgray-30 bg-white text-sm font-bold text-coolgray-80 hover:border-coolgray-50 disabled:opacity-50"
        >
          B
        </button>
        <label className="flex items-center gap-1.5 text-xs text-coolgray-70">
          <span className="shrink-0">크기</span>
          <select
            value={fontSize}
            disabled={disabled}
            onChange={(e) => applyFontSize(Number(e.target.value) as FontSizePt)}
            className="h-8 rounded border border-coolgray-30 bg-white px-2 text-sm text-coolgray-90 disabled:opacity-50"
          >
            {FONT_SIZE_OPTIONS.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11px] text-coolgray-60 ml-auto hidden sm:inline">
          드래그 선택 후 B · 크기 적용
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={syncFromDom}
        onBlur={syncFromDom}
        className="px-3 py-2 text-[12px] leading-[2] text-coolgray-90 outline-none overflow-auto [&_strong]:font-bold disabled:opacity-60"
        style={{ minHeight }}
        aria-label="번역문 편집"
      />
    </div>
  );
}
