/**
 * 이지리드 2단 레이아웃 — 양식: <소제목> + 항목마다 왼쪽 그림 / 오른쪽 본문.
 */
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ImageCatalogItem, ImagePlacement } from "../api/client";
import { BoldText } from "./BoldText";
import {
  formatHeadingDisplay,
  parseSectionItems,
  parseTranslationSections,
  resolvePlacementForItem,
  sectionsToTranslationText,
  type TranslationItem,
  type TranslationSection,
} from "../utils/translationSections";
import { hasBoldMarkers, toggleBoldMarkers, wrapSelectionBold } from "../utils/richText";

export const IMAGE_DRAG_MIME = "application/x-easyread-image";

export function parseDraggedImageItem(dataTransfer: DataTransfer): ImageCatalogItem | null {
  const raw = dataTransfer.getData(IMAGE_DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImageCatalogItem;
  } catch {
    return null;
  }
}

interface EasyReadDocumentViewProps {
  text: string;
  placements?: ImagePlacement[];
  mode: "translate" | "images";
  onTextChange?: (text: string) => void;
  onPlacementsChange?: (placements: ImagePlacement[]) => void;
  fill?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function EasyReadDocumentView({
  text,
  placements = [],
  mode,
  onTextChange,
  onPlacementsChange,
  fill = false,
  placeholder = "번역 결과",
  disabled = false,
}: EasyReadDocumentViewProps) {
  const sections = useMemo(() => parseTranslationSections(text), [text]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function updateSectionLine(sectionIndex: number, lineIndex: number, value: string) {
    if (!onTextChange) return;
    const next = sections.map((s, i) => {
      if (i !== sectionIndex) return s;
      const bodyLines = [...s.bodyLines];
      bodyLines[lineIndex] = value;
      return { ...s, bodyLines };
    });
    onTextChange(sectionsToTranslationText(next));
  }

  function setItemPlacement(
    startLineIndex: number,
    item: ImageCatalogItem,
    sectionHeading: string | null,
  ) {
    if (!onPlacementsChange) return;
    const without = placements.filter((p) => p.line_index !== startLineIndex);
    onPlacementsChange([
      ...without,
      {
        id: crypto.randomUUID(),
        image_file: item.image_file,
        line_index: startLineIndex,
        title: item.title,
        section_heading: sectionHeading,
        image_url:
          item.source_url || (item.url.startsWith("http") ? item.url : null) || null,
      },
    ]);
  }

  function removeItemPlacement(startLineIndex: number) {
    if (!onPlacementsChange) return;
    onPlacementsChange(placements.filter((p) => p.line_index !== startLineIndex));
  }

  if (!text.trim()) {
    return (
      <div
        className={`flex items-center justify-center text-coolgray-60 text-base ${
          fill ? "flex-1 min-h-0" : "min-h-[200px]"
        }`}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${fill ? "min-h-0" : ""}`}>
      {sections.map((section, sectionIndex) => (
        <SectionBlock
          key={`${section.startLineIndex}-${sectionIndex}`}
          section={section}
          mode={mode}
          placements={placements}
          dragOverKey={dragOverKey}
          disabled={disabled}
          onDragOverKey={setDragOverKey}
          onDropItem={(lineIndex, item) => {
            setDragOverKey(null);
            setItemPlacement(lineIndex, item, section.heading);
          }}
          onRemoveItem={removeItemPlacement}
          onLineChange={(lineIndex, value) => updateSectionLine(sectionIndex, lineIndex, value)}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  mode,
  placements,
  dragOverKey,
  disabled,
  onDragOverKey,
  onDropItem,
  onRemoveItem,
  onLineChange,
}: {
  section: TranslationSection;
  mode: "translate" | "images";
  placements: ImagePlacement[];
  dragOverKey: string | null;
  disabled?: boolean;
  onDragOverKey: (key: string | null) => void;
  onDropItem: (lineIndex: number, item: ImageCatalogItem) => void;
  onRemoveItem: (lineIndex: number) => void;
  onLineChange: (lineIndex: number, value: string) => void;
}) {
  const headingDisplay = section.heading ? formatHeadingDisplay(section.heading) : null;
  const items = useMemo(() => parseSectionItems(section), [section]);

  if (mode === "translate") {
    return (
      <article className="space-y-3">
        {headingDisplay && (
          <h3 className="text-[17px] font-bold text-coolgray-90 leading-snug">{headingDisplay}</h3>
        )}
        <p className="text-xs text-coolgray-60">
          문장마다 한 줄 · B 버튼으로 강조(추출물에 굵게 반영)
        </p>
        <div className="space-y-2">
          {section.bodyLines.map((line, lineIndex) => (
            <TranslateLineRow
              key={`${section.startLineIndex}-${lineIndex}`}
              line={line}
              disabled={disabled}
              onChange={(value) => onLineChange(lineIndex, value)}
            />
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-4">
      {headingDisplay && (
        <h3 className="text-[17px] font-bold text-coolgray-90 leading-snug">
          {section.heading!.trim().startsWith("#") || section.heading!.trim().startsWith("■")
            ? <BoldText text={headingDisplay} />
            : headingDisplay}
        </h3>
      )}

      <div className="space-y-5">
        {items.map((item) => (
          <ItemRow
            key={item.startLineIndex}
            item={item}
            placement={resolvePlacementForItem(placements, item, section.heading)}
            dragOver={dragOverKey === String(item.startLineIndex)}
            onDragEnter={() => onDragOverKey(String(item.startLineIndex))}
            onDragLeave={() => onDragOverKey(null)}
            onDrop={(catalogItem) => onDropItem(item.startLineIndex, catalogItem)}
            onRemove={() => onRemoveItem(item.startLineIndex)}
          />
        ))}
      </div>
    </article>
  );
}

function TranslateLineRow({
  line,
  disabled,
  onChange,
}: {
  line: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function applyBold() {
    const el = inputRef.current;
    if (!el) {
      onChange(toggleBoldMarkers(line));
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const { text, selectionStart, selectionEnd } = wrapSelectionBold(line, start, end);
    onChange(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  if (!line.trim()) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={line}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-coolgray-30 rounded text-[13px] leading-tight outline-none focus:border-primary-60 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={applyBold}
          disabled={disabled}
          title="강조 (**굵게**)"
          aria-label="강조"
          className={`shrink-0 size-8 rounded border text-sm font-bold transition-colors disabled:opacity-60 ${
            hasBoldMarkers(line)
              ? "border-primary-60 bg-primary-60/10 text-primary-60"
              : "border-coolgray-30 text-coolgray-70 hover:border-coolgray-50"
          }`}
        >
          B
        </button>
      </div>
      <p className="text-[13px] leading-tight text-coolgray-80 pl-1">
        <BoldText text={line} />
      </p>
    </div>
  );
}

function ItemRow({
  item,
  placement,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemove,
}: {
  item: TranslationItem;
  placement?: ImagePlacement;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,32%)_1fr] gap-4 items-start">
      <ImageSlot
        placement={placement}
        dragOver={dragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onRemove={onRemove}
      />
      <div className="min-w-0 text-[13px] leading-tight text-coolgray-90 space-y-1">
        {item.lines.map((line, i) => (
          <p key={i}>
            <BoldText text={line} />
          </p>
        ))}
      </div>
    </div>
  );
}

function ImageSlot({
  placement,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemove,
}: {
  placement?: ImagePlacement;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemove: () => void;
}) {
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    onDragEnter();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const item = parseDraggedImageItem(e.dataTransfer);
    if (item) onDrop(item);
  }

  if (placement) {
    const url = placement.image_url?.startsWith("http")
      ? placement.image_url
      : `/images/${placement.image_file}`;
    return (
      <div className="relative rounded-lg border border-coolgray-30 bg-[#f5f0e8] p-2 min-h-[120px] flex items-center justify-center">
        <img
          src={url}
          alt={placement.title || "시각자료"}
          className="max-h-32 w-full object-contain"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 size-6 rounded-full bg-white/90 border border-coolgray-30 text-coolgray-60 hover:text-alert text-sm leading-none"
          aria-label="그림 제거"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      className={`rounded-lg border border-dashed min-h-[120px] flex items-center justify-center text-sm text-center px-2 ${
        dragOver
          ? "border-primary-60 bg-primary-60/5 text-primary-60"
          : "border-coolgray-40 bg-[#f5f0e8] text-coolgray-60"
      }`}
    >
      <span>
        그림 DB에서
        <br />
        드래그하여 배치
      </span>
    </div>
  );
}

/** 그림 DB 카드 — 드래그 소스 */
export function DraggableCatalogItem({
  item,
  children,
}: {
  item: ImageCatalogItem;
  children: ReactNode;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(IMAGE_DRAG_MIME, JSON.stringify(item));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="rounded border border-coolgray-20 p-2 bg-white cursor-grab active:cursor-grabbing hover:border-primary-60 transition-colors"
    >
      {children}
    </li>
  );
}
