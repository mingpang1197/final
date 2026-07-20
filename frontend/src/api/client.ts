const API_BASE = "/api";

export type DocType = "criminal" | "civil" | "family" | "administrative" | "unknown";

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

export async function summarize(id: string, force = false): Promise<Document> {
  const q = force ? "?force=true" : "";
  return request<Document>(`/documents/${id}/summarize${q}`, { method: "POST" });
}

export async function updateSummary(id: string, summary: string): Promise<Document> {
  return request<Document>(`/documents/${id}/summary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
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
): Promise<Document> {
  return request<Document>(`/documents/${id}/translation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
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

export async function getImageCatalog(query = ""): Promise<ImageCatalogItem[]> {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<ImageCatalogItem[]>(`/documents/catalog/images${q}`);
}

export async function detectImagePlacements(docId: string): Promise<ImagePlacement[]> {
  return request<ImagePlacement[]>(`/documents/${docId}/translation/detect-placements`, {
    method: "POST",
  });
}
