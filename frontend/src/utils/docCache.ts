import type { DocType, EnsurePayload, UploadResult } from "../api/client";

export interface CachedUpload extends UploadResult {
  pages: string[];
  full_text: string;
}

const KEY_PREFIX = "easyread:doc:";

export function cacheUpload(result: CachedUpload): void {
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${result.id}`, JSON.stringify(result));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function getCachedUpload(id: string): CachedUpload | null {
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedUpload;
  } catch {
    return null;
  }
}

export function summarizeFallbackBody(cached: CachedUpload) {
  return {
    full_text: cached.full_text,
    doc_type: cached.doc_type as DocType,
    filename: cached.filename,
    pages: cached.pages,
  };
}

export function ensurePayload(cached: CachedUpload | null): EnsurePayload | undefined {
  if (!cached?.full_text) return undefined;
  return {
    full_text: cached.full_text,
    doc_type: cached.doc_type as DocType,
    filename: cached.filename,
    pages: cached.pages,
  };
}
