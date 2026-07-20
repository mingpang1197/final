/**
 * 문서 업로드 페이지 (워크플로 1단계) — Figma UI.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type DocType, uploadDocument, updateDocType } from "../api/client";
import { DocTypePills } from "../components/ui/DocTypePills";
import { IconUploadCloud } from "../components/ui/icons";
import { StepIndicator } from "../components/ui/StepIndicator";
import { cacheUpload } from "../utils/docCache";

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<Exclude<DocType, "unknown">>("criminal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setLoading(true);
    setError("");
    try {
      const result = await uploadDocument(file);
      await updateDocType(result.id, docType);
      if (result.pages?.length && result.full_text) {
        cacheUpload({
          ...result,
          doc_type: docType,
          pages: result.pages,
          full_text: result.full_text,
          source_blob_url: URL.createObjectURL(file),
          source_filename: file.name,
          source_mime_type: file.type || undefined,
        });
      }
      navigate(`/documents/${result.id}/summary`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setLoading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-coolgray-10 overflow-y-auto">
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="shrink-0 px-6 pt-4 pb-3">
          <h1 className="text-[42px] font-bold leading-tight text-coolgray-90">
            Easy-Read 판결문 작성 보조
          </h1>
        </header>

        <div className="mx-6 shrink-0 bg-white border border-coolgray-20 border-b-0">
          <StepIndicator current="upload" />
          <DocTypePills active={docType} disabled={loading} onChange={setDocType} />
        </div>
      </div>

      <div
        className="shrink-0 mx-6 mb-4 bg-white border border-coolgray-20 overflow-hidden flex flex-col"
        style={{ height: "var(--workflow-body-height)" }}
      >
        <div className="flex-1 p-8 max-w-3xl mx-auto w-full flex flex-col justify-center min-h-0 overflow-y-auto">
          <h2 className="text-2xl font-bold text-coolgray-90 mb-6 shrink-0">새 프로젝트</h2>

          <div
            className={`rounded-xl border-2 border-dashed p-12 flex flex-col items-center gap-4 transition-colors ${
              dragOver
                ? "border-primary-60 bg-blue-50"
                : "border-coolgray-30 bg-coolgray-10"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <IconUploadCloud className="size-8" />
            <div className="text-center">
              <p className="text-base font-medium text-coolgray-90">
                {loading ? "업로드 중..." : "Drop file or browse"}
              </p>
              <p className="text-sm text-coolgray-60 mt-1">
                Format: PDF, PNG, JPG, TXT, DOC, DOCX, HWP · Max 25 MB
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="px-4 py-1 text-sm font-semibold text-white bg-[#6794e5] border border-white rounded-lg shadow-sm hover:bg-primary-60 disabled:opacity-50"
            >
              Browse Files
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx,.hwp,.hwpx"
              disabled={loading}
              onChange={onInputChange}
            />
          </div>

          {error && (
            <p className="mt-4 text-sm text-alert text-center shrink-0">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
