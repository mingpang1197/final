import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDocument } from "../api/client";
import { cacheUpload } from "../utils/docCache";

export function UploadPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const result = await uploadDocument(file);
      if (result.pages?.length && result.full_text) {
        cacheUpload({
          ...result,
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

  return (
    <div className="max-w-xl mx-auto mt-16 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <h1 className="text-2xl font-bold mb-2">Easy-Read 판결문 작성 보조</h1>
      <p className="text-slate-600 mb-6 text-sm">
        판결문 PDF·이미지·TXT를 업로드하면 OCR → 요약 → 이지리드 번역 → Word 출력까지 진행합니다.
      </p>
      <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
        <span className="text-slate-500">{loading ? "업로드 중..." : "파일 선택 또는 드래그"}</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx,.hwp,.hwpx"
          disabled={loading}
          onChange={handleFile}
        />
      </label>
      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
    </div>
  );
}
