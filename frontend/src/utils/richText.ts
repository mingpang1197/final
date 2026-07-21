/** 이지리드 서식(**굵게**, <14>크기</14>) 편집·렌더 유틸 */

import { isSectionHeading } from "./translationSections";

export const FONT_SIZE_OPTIONS = [12, 14, 17] as const;
export type FontSizePt = (typeof FONT_SIZE_OPTIONS)[number];

const STYLE_TOKEN =
  /(\*\*(?:\\.|[^*])+\*\*|<(12|14|17)>(?:\\.|[^<])+<\/\2>)/g;

const BOLD_INNER = /^\*\*(.+)\*\*$/;
const SIZE_INNER = /^<(12|14|17)>(.+)<\/\1>$/;

export function hasStyleMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(text) || /<(12|14|17)>.+?<\/(12|14|17)>/.test(text);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type StyledPart = {
  text: string;
  bold: boolean;
  sizePt: FontSizePt;
};

export function parseStyledParts(text: string, defaultSize: FontSizePt = 12): StyledPart[] {
  const parts: StyledPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(STYLE_TOKEN.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      const plain = text.slice(last, match.index);
      if (plain) parts.push({ text: plain, bold: false, sizePt: defaultSize });
    }
    const token = match[0];
    const boldMatch = token.match(BOLD_INNER);
    if (boldMatch) {
      parts.push(...parseStyledParts(boldMatch[1], defaultSize).map((p) => ({ ...p, bold: true })));
    } else {
      const sizeMatch = token.match(SIZE_INNER);
      if (sizeMatch) {
        const sizePt = Number(sizeMatch[1]) as FontSizePt;
        parts.push(...parseStyledParts(sizeMatch[2], sizePt));
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    const tail = text.slice(last);
    if (tail) parts.push({ text: tail, bold: false, sizePt: defaultSize });
  }
  return parts;
}

export function splitStyledTokens(text: string): string[] {
  return text.split(STYLE_TOKEN).filter(Boolean);
}

/** 저장 형식 → WYSIWYG HTML */
export function markersToHtml(text: string): string {
  if (!text) return "";

  return text
    .split("\n")
    .map((line) => {
      if (!line) return "<br>";
      if (isSectionHeading(line) && !hasStyleMarkers(line)) {
        const inner = escapeHtml(line.replace(/^#+\s*/, "").trim());
        return `<div data-er-heading="1" style="font-size:17px;font-weight:bold;margin-top:8px">${inner}</div>`;
      }
      const html = parseStyledParts(line)
        .map(({ text: chunk, bold, sizePt }) => {
          let inner = escapeHtml(chunk);
          if (bold) inner = `<strong>${inner}</strong>`;
          if (sizePt !== 12) {
            inner = `<span data-font-pt="${sizePt}" style="font-size:${sizePt}px">${inner}</span>`;
          }
          return inner;
        })
        .join("");
      return `<div>${html || "<br>"}</div>`;
    })
    .join("");
}

function parseFontPt(el: HTMLElement): FontSizePt | null {
  const data = el.dataset.fontPt;
  if (data && FONT_SIZE_OPTIONS.includes(Number(data) as FontSizePt)) {
    return Number(data) as FontSizePt;
  }
  const px = el.style.fontSize;
  if (px.endsWith("px")) {
    const n = Math.round(Number(px.replace("px", "")));
    if (FONT_SIZE_OPTIONS.includes(n as FontSizePt)) return n as FontSizePt;
  }
  return null;
}

function nodeToMarkers(node: Node, ctx: { bold: boolean; sizePt: FontSizePt }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? "";
    if (!raw) return "";
    let out = raw;
    if (ctx.bold) out = `**${out}**`;
    if (ctx.sizePt !== 12) out = `<${ctx.sizePt}>${out}</${ctx.sizePt}>`;
    return out;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  if (el.tagName === "BR") return "\n";

  const nextCtx = { ...ctx };
  if (el.tagName === "STRONG" || el.tagName === "B") nextCtx.bold = true;
  const fontPt = parseFontPt(el);
  if (fontPt) nextCtx.sizePt = fontPt;

  if (el.tagName === "DIV" || el.tagName === "P") {
    const inner = Array.from(el.childNodes).map((child) => nodeToMarkers(child, ctx)).join("");
    if (el.dataset.erHeading === "1") {
      return inner + "\n";
    }
    return inner + "\n";
  }

  return Array.from(el.childNodes).map((child) => nodeToMarkers(child, nextCtx)).join("");
}

/** WYSIWYG HTML → 저장 형식 */
export function htmlToMarkers(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const lines: string[] = [];

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === "DIV") {
      const line = Array.from(child.childNodes)
        .map((n) => nodeToMarkers(n, { bold: false, sizePt: 12 }))
        .join("");
      lines.push(line);
    } else {
      const chunk = nodeToMarkers(child, { bold: false, sizePt: 12 });
      if (chunk.endsWith("\n")) lines.push(chunk.slice(0, -1));
      else if (chunk) lines.push(chunk);
    }
  }

  return lines.join("\n").replace(/\n+$/, "");
}

export function hasBoldMarkers(text: string): boolean {
  return /\*\*.+?\*\*/.test(text);
}
