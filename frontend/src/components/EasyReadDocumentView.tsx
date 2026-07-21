/**
 * 이지리드 2단 레이아웃 — 양식: <소제목> + 항목마다 왼쪽 그림 / 오른쪽 본문.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { ImageCatalogItem, ImagePlacement } from "../api/client";
import { StyledLine } from "./BoldText";
import { RichTextEditor } from "./RichTextEditor";
import {
  parseSectionItems,
  parseTranslationSections,
  resolvePlacementForItem,
  resolvePlacementForSectionHeading,
  splitStandardClosing,
  type TranslationItem,
  type TranslationSection,
} from "../utils/translationSections";

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
  const { body: documentBody, closing } = useMemo(() => splitStandardClosing(text), [text]);
  const sections = useMemo(() => parseTranslationSections(documentBody), [documentBody]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

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
        auto_filled: false,
      },
    ]);
  }

  function removeItemPlacement(startLineIndex: number) {
    if (!onPlacementsChange) return;
    const target = placements.find((p) => p.line_index === startLineIndex);
    if (target?.auto_filled) return;
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

  if (mode === "translate") {
    return (
      <RichTextEditor
        value={text}
        onChange={(v) => onTextChange?.(v)}
        disabled={disabled}
        layout="export-preview"
        fill={fill}
        minHeight={fill ? "100%" : "360px"}
      />
    );
  }

  return (
    <div className={`space-y-8 ${fill ? "min-h-0" : ""}`}>
      {sections.map((section, sectionIndex) => (
        <SectionBlock
          key={`${section.startLineIndex}-${sectionIndex}`}
          section={section}
          placements={placements}
          dragOverKey={dragOverKey}
          onDragOverKey={setDragOverKey}
          onDropItem={(lineIndex, item) => {
            setDragOverKey(null);
            setItemPlacement(lineIndex, item, section.heading);
          }}
          onRemoveItem={removeItemPlacement}
        />
      ))}
      {closing && (
        <p className="text-[12px] leading-[2] text-coolgray-90 pt-2">
          <StyledLine text={closing} />
        </p>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  placements,
  dragOverKey,
  onDragOverKey,
  onDropItem,
  onRemoveItem,
}: {
  section: TranslationSection;
  placements: ImagePlacement[];
  dragOverKey: string | null;
  onDragOverKey: (key: string | null) => void;
  onDropItem: (lineIndex: number, item: ImageCatalogItem) => void;
  onRemoveItem: (lineIndex: number) => void;
}) {
  const items = useMemo(() => parseSectionItems(section), [section]);

  return (
    <article className="space-y-4">
      {section.heading && (
        <h3 className="leading-snug">
          <StyledLine text={section.heading} heading />
        </h3>
      )}

      {section.heading && (
        <ItemRow
          item={{ lines: [], startLineIndex: section.startLineIndex }}
          placement={resolvePlacementForSectionHeading(placements, section)}
          dragOver={dragOverKey === `section-${section.startLineIndex}`}
          onDragEnter={() => onDragOverKey(`section-${section.startLineIndex}`)}
          onDragLeave={() => onDragOverKey(null)}
          onDrop={(catalogItem) => onDropItem(section.startLineIndex, catalogItem)}
          onRemove={() => onRemoveItem(section.startLineIndex)}
          emptyLabel={
            <>
              소제목 대표 그림
              <br />
              (드래그하여 변경)
            </>
          }
        />
      )}

      <div className="space-y-5">
        {items.map((item) => (
          <ItemRow
            key={item.startLineIndex}
            item={item}
            placement={resolvePlacementForItem(placements, item)}
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

function ItemRow({
  item,
  placement,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemove,
  emptyLabel,
}: {
  item: TranslationItem;
  placement?: ImagePlacement;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemove: () => void;
  emptyLabel?: ReactNode;
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
        emptyLabel={emptyLabel}
      />
      <div className="min-w-0 text-[12px] leading-[2] text-coolgray-90 space-y-1">
        {item.lines.map((line, i) => (
          <p key={i}>
            <StyledLine text={line} />
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
  emptyLabel,
}: {
  placement?: ImagePlacement;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemove: () => void;
  emptyLabel?: ReactNode;
}) {
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    onDragEnter();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    onDragLeave();
    const item = parseDraggedImageItem(e.dataTransfer);
    if (item) onDrop(item);
  }

  const url = placement
    ? placement.image_url?.startsWith("http")
      ? placement.image_url
      : `/images/${placement.image_file}`
    : null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-lg border min-h-[120px] flex items-center justify-center p-2 ${
        placement
          ? "border-coolgray-30 bg-[#f5f0e8]"
          : dragOver
            ? "border-primary-60 border-dashed bg-primary-60/5 text-primary-60"
            : "border-dashed border-coolgray-40 bg-[#f5f0e8] text-coolgray-60"
      } ${dragOver && placement ? "ring-2 ring-primary-60 ring-offset-1" : ""}`}
    >
      {placement && url ? (
        <>
          <img
            src={url}
            alt={placement.title || "시각자료"}
            className="max-h-32 w-full object-contain pointer-events-none"
          />
          {!placement.auto_filled && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-1 right-1 size-6 rounded-full bg-white/90 border border-coolgray-30 text-coolgray-60 hover:text-alert text-sm leading-none"
              aria-label="그림 제거"
            >
              ×
            </button>
          )}
        </>
      ) : (
        <span className="text-sm text-center px-2 pointer-events-none">
          {emptyLabel ?? (
            <>
              그림 DB에서
              <br />
              드래그하여 배치
            </>
          )}
        </span>
      )}
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
