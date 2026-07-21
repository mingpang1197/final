import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorHistory } from "../hooks/useEditorHistory";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_PRESETS,
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
  layout?: RichTextEditorLayout;
  fill?: boolean;
}

function FontSizeCombo({
  value,
  disabled,
  onApply,
}: {
  value: FontSizePt;
  disabled?: boolean;
  onApply: (size: FontSizePt) => void;
}) {
  const [input, setInput] = useState(String(value));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(String(value));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function commitInput() {
    const parsed = clampFontSize(Number(input));
    setInput(String(parsed));
    onApply(parsed);
  }

  function pickPreset(size: FontSizePt) {
    setInput(String(size));
    onApply(size);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex items-stretch h-8">
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitInput();
          }
        }}
        onBlur={commitInput}
        aria-label="글자 크기"
        className="w-11 rounded-l border border-coolgray-30 border-r-0 bg-white px-1.5 text-sm text-center text-coolgray-90 outline-none focus:border-primary-60 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label="글자 크기 목록"
        className="w-7 rounded-r border border-coolgray-30 bg-white text-[10px] text-coolgray-60 hover:bg-coolgray-10 disabled:opacity-50"
      >
        ▼
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-20 mt-0.5 max-h-52 w-16 overflow-y-auto rounded border border-coolgray-30 bg-white py-1 shadow-md">
          {FONT_SIZE_PRESETS.map((pt) => (
            <li key={pt}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickPreset(pt)}
                className={`w-full px-2 py-1 text-left text-sm hover:bg-coolgray-10 ${
                  pt === value ? "bg-coolgray-10 font-medium" : ""
                }`}
              >
                {pt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditorToolbar({
  disabled,
  fontSize,
  onBold,
  onFontSize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onToolbarMouseDown,
}: {
  disabled?: boolean;
  fontSize: FontSizePt;
  onBold: () => void;
  onFontSize: (size: FontSizePt) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onToolbarMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 border-b border-coolgray-20 bg-coolgray-10 shrink-0"
      onMouseDown={onToolbarMouseDown}
    >
      <button
        type="button"
        disabled={disabled || !canUndo}
        onClick={onUndo}
        title="되돌리기 (Ctrl+Z)"
        aria-label="되돌리기"
        className="min-w-8 h-8 px-2 rounded border border-coolgray-30 bg-white text-sm text-coolgray-80 hover:border-coolgray-50 disabled:opacity-40"
      >
        ↶
      </button>
      <button
        type="button"
        disabled={disabled || !canRedo}
        onClick={onRedo}
        title="다시 실행 (Ctrl+Y)"
        aria-label="다시 실행"
        className="min-w-8 h-8 px-2 rounded border border-coolgray-30 bg-white text-sm text-coolgray-80 hover:border-coolgray-50 disabled:opacity-40"
      >
        ↷
      </button>
      <span className="w-px h-6 bg-coolgray-30 shrink-0" aria-hidden />
      <button
        type="button"
        disabled={disabled}
        onClick={onBold}
        title="굵게"
        aria-label="굵게"
        className="min-w-8 h-8 px-2 rounded border border-coolgray-30 bg-white hover:border-coolgray-50 disabled:opacity-50"
      >
        <span className="text-base font-bold text-coolgray-90 leading-none">가</span>
      </button>
      <FontSizeCombo value={fontSize} disabled={disabled} onApply={onFontSize} />
      <span className="text-[11px] text-coolgray-60 ml-auto hidden sm:inline">
        Ctrl+Z/Y · 드래그 후 굵게·크기
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
  const savedRangeRef = useRef<Range | null>(null);
  const savedValueRef = useRef("");
  const initializedRef = useRef(false);
  const [fontSize, setFontSize] = useState<FontSizePt>(DEFAULT_FONT_SIZE);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const history = useEditorHistory(value);

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [history]);

  const applyMarkersToEditor = useCallback(
    (markers: string, notifyParent: boolean) => {
      if (editorRef.current) {
        editorRef.current.innerHTML = markersToHtml(markers);
      }
      savedValueRef.current = markers;
      if (notifyParent) onChange(markers);
    },
    [onChange],
  );

  const syncFromDom = useCallback(() => {
    if (!editorRef.current || history.isApplying()) return;
    const markers = htmlToMarkers(editorRef.current.innerHTML);
    if (markers === savedValueRef.current) return;
    history.recordChange(markers);
    savedValueRef.current = markers;
    onChange(markers);
    refreshHistoryFlags();
  }, [history, onChange, refreshHistoryFlags]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range || !editorRef.current) return false;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return !sel.isCollapsed;
  }, []);

  const performUndo = useCallback(() => {
    if (disabled) return;
    const prev = history.undo(savedValueRef.current);
    if (prev === null) return;
    history.runApplying(() => {
      applyMarkersToEditor(prev, true);
      editorRef.current?.focus();
    });
    refreshHistoryFlags();
  }, [applyMarkersToEditor, disabled, history, refreshHistoryFlags]);

  const performRedo = useCallback(() => {
    if (disabled) return;
    const next = history.redo(savedValueRef.current);
    if (next === null) return;
    history.runApplying(() => {
      applyMarkersToEditor(next, true);
      editorRef.current?.focus();
    });
    refreshHistoryFlags();
  }, [applyMarkersToEditor, disabled, history, refreshHistoryFlags]);

  useEffect(() => {
    if (!editorRef.current || history.isApplying()) return;

    if (!initializedRef.current) {
      editorRef.current.innerHTML = markersToHtml(value);
      savedValueRef.current = value;
      history.resetHistory(value);
      initializedRef.current = true;
      refreshHistoryFlags();
      return;
    }

    if (value !== savedValueRef.current) {
      editorRef.current.innerHTML = markersToHtml(value);
      savedValueRef.current = value;
      history.resetHistory(value);
      refreshHistoryFlags();
    }
  }, [value, history, refreshHistoryFlags]);

  function wrapRangeWithFontSize(range: Range, size: FontSizePt) {
    const span = document.createElement("span");
    span.style.fontSize = `${size}px`;
    span.dataset.fontPt = String(size);

    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const next = document.createRange();
      next.selectNodeContents(span);
      sel.addRange(next);
      savedRangeRef.current = next.cloneRange();
    }
  }

  function applyBold() {
    if (disabled || !editorRef.current) return;
    if (!restoreSelection()) return;
    document.execCommand("bold");
    saveSelection();
    syncFromDom();
  }

  function applyFontSize(size: FontSizePt) {
    const pt = clampFontSize(size);
    setFontSize(pt);
    if (disabled || !editorRef.current) return;
    if (!restoreSelection()) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    wrapRangeWithFontSize(sel.getRangeAt(0), pt);
    syncFromDom();
  }

  function handleToolbarMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("input")) return;
    e.preventDefault();
  }

  function handleEditorKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      performUndo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey) || (e.key === "Z" && e.shiftKey)) {
      e.preventDefault();
      performRedo();
    }
  }

  const editorClassName =
    "min-w-0 min-h-0 flex-1 px-2 py-2 text-[12px] leading-[2] text-coolgray-90 outline-none overflow-y-auto [&_strong]:font-bold disabled:opacity-60";

  const editor = (
    <div
      ref={editorRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={syncFromDom}
      onBlur={syncFromDom}
      onMouseUp={saveSelection}
      onKeyUp={saveSelection}
      onKeyDown={handleEditorKeyDown}
      className={editorClassName}
      style={fill ? undefined : { minHeight }}
      aria-label="번역문 편집"
    />
  );

  return (
    <div
      className={`rounded-lg border border-coolgray-30 overflow-hidden bg-white flex flex-col ${
        fill ? "h-full min-h-0" : ""
      }`}
    >
      <EditorToolbar
        disabled={disabled}
        fontSize={fontSize}
        onBold={applyBold}
        onFontSize={applyFontSize}
        onUndo={performUndo}
        onRedo={performRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolbarMouseDown={handleToolbarMouseDown}
      />
      {layout === "export-preview" ? (
        <div
          className={`grid grid-cols-[minmax(120px,32%)_1fr] gap-4 p-3 min-h-0 ${
            fill ? "flex-1 overflow-hidden" : ""
          }`}
        >
          <div className="rounded-lg border border-dashed border-coolgray-40 bg-[#f5f0e8] min-h-[120px] flex items-center justify-center text-xs text-center text-coolgray-60 px-2">
            <span>
              그림 영역
              <br />
              (그림·추출과 동일)
            </span>
          </div>
          <div className={`min-w-0 min-h-0 flex flex-col ${fill ? "h-full overflow-hidden" : ""}`}>
            {editor}
          </div>
        </div>
      ) : (
        editor
      )}
    </div>
  );
}
