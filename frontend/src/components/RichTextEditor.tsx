import { useCallback, useEffect, useRef, useState } from "react";
import {
  FONT_SIZE_OPTIONS,
  htmlToMarkers,
  markersToHtml,
  type FontSizePt,
} from "../utils/richText";

export type RichTextEditorLayout = "full" | "export-preview";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  minHeight?: string;
  /** 그림·추출 탭과 동일한 2단(왼쪽 그림 / 오른쪽 본문) 미리보기 */
  layout?: RichTextEditorLayout;
  fill?: boolean;
}

function EditorToolbar({
  disabled,
  fontSize,
  onBold,
  onFontSize,
  onMouseDown,
}: {
  disabled?: boolean;
  fontSize: FontSizePt;
  onBold: () => void;
  onFontSize: (size: FontSizePt) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 border-b border-coolgray-20 bg-coolgray-10 shrink-0"
      onMouseDown={onMouseDown}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onBold}
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
          onChange={(e) => onFontSize(Number(e.target.value) as FontSizePt)}
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
        드래그 선택 후 B · 크기 (소제목 포함)
      </span>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  minHeight = "120px",
  layout = "full",
  fill = false,
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

  const editorClassName =
    "min-w-0 px-2 py-2 text-[12px] leading-[2] text-coolgray-90 outline-none overflow-auto [&_strong]:font-bold disabled:opacity-60";

  const editorStyle = fill ? { minHeight: "200px", flex: 1 } : { minHeight };

  const toolbar = (
    <EditorToolbar
      disabled={disabled}
      fontSize={fontSize}
      onBold={applyBold}
      onFontSize={applyFontSize}
      onMouseDown={handleToolbarMouseDown}
    />
  );

  const editor = (
    <div
      ref={editorRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={syncFromDom}
      onBlur={syncFromDom}
      className={editorClassName}
      style={editorStyle}
      aria-label="번역문 편집"
    />
  );

  return (
    <div
      className={`rounded-lg border border-coolgray-30 overflow-hidden bg-white flex flex-col ${
        fill ? "h-full min-h-0" : ""
      }`}
    >
      {toolbar}
      {layout === "export-preview" ? (
        <div
          className={`grid grid-cols-[minmax(120px,32%)_1fr] gap-4 p-3 items-start ${
            fill ? "flex-1 min-h-0" : ""
          }`}
        >
          <div className="rounded-lg border border-dashed border-coolgray-40 bg-[#f5f0e8] min-h-[120px] self-stretch flex items-center justify-center text-xs text-center text-coolgray-60 px-2">
            <span>
              그림 영역
              <br />
              (그림·추출과 동일)
            </span>
          </div>
          {editor}
        </div>
      ) : (
        editor
      )}
    </div>
  );
}
