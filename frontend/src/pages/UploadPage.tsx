/**
 * 문서 업로드 페이지 (워크플로 1단계) — Figma 업로드 최종 UI.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type DocType, uploadDocument, updateDocType } from "../api/client";
import { ExistingProjectsTable } from "../components/ui/ExistingProjectsTable";
import { ChatbotWidget } from "../components/ui/ChatbotWidget";
import { IconUploadCloud } from "../components/ui/icons";
import { StepIndicator } from "../components/ui/StepIndicator";
import { UploadCaseTypeBar } from "../components/ui/UploadCaseTypeBar";
import { cacheUpload, getLastDocId } from "../utils/docCache";

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<Exclude<DocType, "unknown">>("criminal");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleUpload(file: File) {
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

  function selectFile(file: File) {
    setError("");
    setPendingFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) selectFile(file);
  }

  function handleDone() {
    if (pendingFile && !loading) {
      handleUpload(pendingFile);
    }
  }

  return (
    <div className="min-h-screen bg-coolgray-10 flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-[42px] font-bold leading-tight text-coolgray-90">
          ERAI(Easy Read As ~)
        </h1>
      </header>

      <div className="flex-1 mx-6 mb-6 bg-white border border-coolgray-20 overflow-hidden flex flex-col">
        <StepIndicator current="upload" docId={getLastDocId() ?? undefined} />
        <UploadCaseTypeBar active={docType} disabled={loading} onChange={setDocType} />

        <div className="flex-1 overflow-y-auto">
          <section className="mx-5 mt-4">
            <h2 className="text-2xl font-bold text-coolgray-90 mb-4">새 프로젝트</h2>

            <div className="rounded-xl border border-[#e6e7ea] bg-coolgray-10 p-6">
              <div
                className={`mx-auto max-w-3xl rounded-lg border border-dashed p-8 flex flex-col items-center gap-3 transition-colors ${
                  dragOver
                    ? "border-primary-60 bg-blue-50"
                    : "border-coolgray-30 bg-[#dde1e6]"
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
                    {pendingFile ? pendingFile.name : "Drop file or browse"}
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

              <div className="mx-auto max-w-xl mt-4">
                <button
                  type="button"
                  disabled={loading || !pendingFile}
                  onClick={handleDone}
                  className="w-full py-2.5 text-base font-semibold text-white bg-primary-60 border border-white rounded-lg shadow-sm hover:bg-primary-90 disabled:opacity-50 transition-colors"
                >
                  {loading ? "업로드 중..." : "Done"}
                </button>
              </div>

              {error && (
                <p className="mt-3 text-sm text-alert text-center">{error}</p>
              )}
            </div>
          </section>

          <ExistingProjectsTable />
        </div>
      </div>

      <ChatbotWidget />
    </div>
  );
}
