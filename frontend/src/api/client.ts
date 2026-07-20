/**
 * 백엔드 REST API 클라이언트 및 공유 타입 정의.
 *
 * 역할: 문서 업로드·요약·번역·체크리스트·Word 출력 등 API 호출을 캡슐화한다.
 * 주요 기능: fetch 래퍼, Document/TranslationSegment 타입, 파일 다운로드.
 * 연관 파일: pages/*.tsx, components/*.tsx, utils/docCache.ts
 */
const API_BASE = "/api";

export type DocType = "criminal" | "civil" | "family" | "administrative" | "unknown";

export const DOC_TYPE_LABELS: Record<Exclude<DocType, "unknown">, string> = {
  criminal: "형사",
  civil: "민사",
  family: "가사",
  administrative: "행정",
};

export const DOC_TYPE_OPTIONS: { value: Exclude<DocType, "unknown">; label: string }[] = [
  { value: "criminal", label: "형사" },
  { value: "civil", label: "민사" },
  { value: "family", label: "가사" },
  { value: "administrative", label: "행정" },
];

export interface ImagePlacement {
  id: string;
  image_file: string;
  line_index: number;
  title?: string | null;
}

export interface ImageCatalogItem {
  image_file: string;
  title: string;
  url: string;
}

export interface TranslationSegment {
  id: string;
  original: string;
  easy_text: string;
  image_file?: string | null;
  image_url?: string | null;
  title?: string | null;
  source: "db" | "solar" | "manual";
  image_placements?: ImagePlacement[];
}

export interface ChecklistItemResult {
  id: string;
  category: string;
  label: string;
  status: "pass" | "warn" | "fail" | "manual";
  detail?: string | null;
}

export interface ChecklistReport {
  overall: "pass" | "warn" | "fail";
  summary: Record<string, number>;
  items: ChecklistItemResult[];
}

export interface Document {
  id: string;
  filename: string;
  doc_type: DocType;
  stage: "uploaded" | "summarized" | "translated";
  page_count: number;
  full_text: string;
  summary?: string | null;
  translation_segments: TranslationSegment[];
  translation_text?: string | null;
  checklist?: ChecklistReport | null;
}

export interface UploadResult {
  id: string;
  filename: string;
  doc_type: DocType;
  page_count: number;
  message: string;
  pages?: string[];
  full_text?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return res as unknown as T;
}

export async function uploadDocument(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadResult>("/documents/upload", { method: "POST", body: form });
}

export async function getDocument(id: string): Promise<Document> {
  return request<Document>(`/documents/${id}`);
}

export async function getPage(id: string, pageNum: number): Promise<string> {
  const data = await request<{ page: string }>(`/documents/${id}/pages/${pageNum}`);
  return data.page;
}

export async function summarize(id: string, force = false, fallback?: {
  full_text: string;
  doc_type: DocType;
  filename: string;
  pages: string[];
}): Promise<Document> {
  const q = force ? "?force=true" : "";
  return request<Document>(`/documents/${id}/summarize${q}`, {
    method: "POST",
    headers: fallback ? { "Content-Type": "application/json" } : undefined,
    body: fallback ? JSON.stringify(fallback) : undefined,
  });
}

export interface EnsurePayload {
  full_text: string;
  doc_type: DocType;
  filename: string;
  pages: string[];
}

export async function updateSummary(
  id: string,
  summary: string,
  ensure?: EnsurePayload,
): Promise<Document> {
  return request<Document>(`/documents/${id}/summary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, ...ensure }),
  });
}

export async function updateDocType(id: string, docType: DocType): Promise<Document> {
  return request<Document>(`/documents/${id}/doc-type`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_type: docType }),
  });
}

export async function refineSummary(id: string, prompt: string): Promise<Document> {
  return request<Document>(`/documents/${id}/summary/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function translate(id: string): Promise<Document> {
  return request<Document>(`/documents/${id}/translate`, { method: "POST" });
}

export async function updateTranslation(
  id: string,
  segments: TranslationSegment[],
  ensure?: EnsurePayload & { summary?: string },
): Promise<Document> {
  return request<Document>(`/documents/${id}/translation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, ...ensure }),
  });
}

export async function refineTranslation(id: string, prompt: string): Promise<Document> {
  return request<Document>(`/documents/${id}/translation/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function runChecklist(id: string): Promise<ChecklistReport> {
  return request<ChecklistReport>(`/documents/${id}/translation/checklist`, {
    method: "POST",
  });
}

export function exportDocxUrl(id: string): string {
  return `${API_BASE}/documents/${id}/export.docx`;
}

export interface ExportPayload {
  segments: TranslationSegment[];
  translation_text?: string;
  summary?: string;
  filename?: string;
  doc_type?: DocType;
  full_text?: string;
  pages?: string[];
}

export async function downloadDocx(id: string, payload: ExportPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}/export.docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      translation_text:
        payload.translation_text ??
        payload.segments.map((s) => s.easy_text).filter(Boolean).join("\n\n"),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `easyread_${id.slice(0, 8)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getImageCatalog(query = ""): Promise<ImageCatalogItem[]> {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<ImageCatalogItem[]>(`/documents/catalog/images${q}`);
}

export async function detectImagePlacements(docId: string): Promise<ImagePlacement[]> {
  return request<ImagePlacement[]>(`/documents/${docId}/translation/detect-placements`, {
    method: "POST",
  });
}
