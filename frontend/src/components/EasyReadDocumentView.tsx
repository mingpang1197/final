/**
 * 이지리드 2단 레이아웃 — 소제목 아래 왼쪽 그림 / 오른쪽 본문.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { ImageCatalogItem, ImagePlacement } from "../api/client";
import {
  formatHeadingDisplay,
  isSectionHeading,
  parseTranslationSections,
  sectionsToTranslationText,
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

function renderBoldText(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part.replace(/\*\*/g, "")}</span>;
  });
}

function placementForSection(
  placements: ImagePlacement[],
  startLineIndex: number,
): ImagePlacement | undefined {
  return placements.find((p) => p.line_index === startLineIndex);
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
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);

  function updateSectionBody(sectionIndex: number, body: string) {
    if (!onTextChange) return;
    const next = sections.map((s, i) =>
      i === sectionIndex ? { ...s, bodyLines: body.split("\n") } : s,
    );
    onTextChange(sectionsToTranslationText(next));
  }

  function setSectionPlacement(startLineIndex: number, item: ImageCatalogItem, sectionHeading: string | null) {
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

  function removeSectionPlacement(startLineIndex: number) {
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
          placement={placementForSection(placements, section.startLineIndex)}
          dragOver={dragOverSection === sectionIndex}
          disabled={disabled}
          onDragEnter={() => mode === "images" && setDragOverSection(sectionIndex)}
          onDragLeave={() => setDragOverSection(null)}
          onDrop={(item) => {
            setDragOverSection(null);
            setSectionPlacement(section.startLineIndex, item, section.heading);
          }}
          onRemoveImage={() => removeSectionPlacement(section.startLineIndex)}
          onBodyChange={(body) => updateSectionBody(sectionIndex, body)}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  mode,
  placement,
  dragOver,
  disabled,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemoveImage,
  onBodyChange,
}: {
  section: TranslationSection;
  mode: "translate" | "images";
  placement?: ImagePlacement;
  dragOver: boolean;
  disabled?: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemoveImage: () => void;
  onBodyChange: (body: string) => void;
}) {
  const headingDisplay = section.heading ? formatHeadingDisplay(section.heading) : null;
  const bodyText = section.bodyLines.join("\n");

  return (
    <article className="space-y-3">
      {headingDisplay && (
        <h3
          className={`text-[17px] font-bold text-coolgray-90 leading-snug ${
            isSectionHeading(section.heading!) && section.heading!.trim().startsWith("■")
              ? ""
              : ""
          }`}
        >
          {section.heading!.trim().startsWith("#") || section.heading!.trim().startsWith("■")
            ? renderBoldText(headingDisplay)
            : headingDisplay}
        </h3>
      )}

      <div className="grid grid-cols-[minmax(120px,32%)_1fr] gap-4 items-start">
        <ImageSlot
          mode={mode}
          placement={placement}
          dragOver={dragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onRemove={onRemoveImage}
        />

        <div className="min-w-0 text-[15px] leading-relaxed text-coolgray-90">
          {mode === "translate" ? (
            <textarea
              className="w-full min-h-[120px] p-3 bg-coolgray-10 border border-coolgray-30 rounded-lg text-[15px] leading-relaxed resize-y outline-none focus:border-primary-60 disabled:opacity-60"
              value={bodyText}
              onChange={(e) => onBodyChange(e.target.value)}
              disabled={disabled}
              placeholder="본문을 입력하세요"
            />
          ) : bodyText ? (
            <div className="space-y-2">
              {section.bodyLines.map((line, i) => (
                <p key={i}>{renderBoldText(line)}</p>
              ))}
            </div>
          ) : (
            <p className="text-coolgray-60 text-sm">본문 없음</p>
          )}
        </div>
      </div>
    </article>
  );
}

function ImageSlot({
  mode,
  placement,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemove,
}: {
  mode: "translate" | "images";
  placement?: ImagePlacement;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (item: ImageCatalogItem) => void;
  onRemove: () => void;
}) {
  const interactive = mode === "images";

  function handleDragOver(e: DragEvent) {
    if (!interactive) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    onDragEnter();
  }

  function handleDrop(e: DragEvent) {
    if (!interactive) return;
    e.preventDefault();
    const item = parseDraggedImageItem(e.dataTransfer);
    if (item) onDrop(item);
  }

  if (placement) {
    const url = placement.image_url?.startsWith("http")
      ? placement.image_url
      : `/images/${placement.image_file}`;
    return (
      <div className="relative rounded-lg border border-coolgray-30 bg-[#f5f0e8] p-2 min-h-[140px] flex items-center justify-center">
        <img
          src={url}
          alt={placement.title || "시각자료"}
          className="max-h-36 w-full object-contain"
        />
        {interactive && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1 right-1 size-6 rounded-full bg-white/90 border border-coolgray-30 text-coolgray-60 hover:text-alert text-sm leading-none"
            aria-label="그림 제거"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      className={`rounded-lg border border-dashed min-h-[140px] flex items-center justify-center text-sm text-center px-2 ${
        interactive
          ? dragOver
            ? "border-primary-60 bg-primary-60/5 text-primary-60"
            : "border-coolgray-40 bg-[#f5f0e8] text-coolgray-60"
          : "border-coolgray-30 bg-coolgray-10 text-coolgray-40"
      }`}
    >
      {interactive ? (
        <span>
          그림 DB에서
          <br />
          드래그하여 배치
        </span>
      ) : (
        <span>그림</span>
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
