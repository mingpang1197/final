interface PromptBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
}

export function PromptBar({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder = "AI에게 수정 방식을 입력하세요...",
}: PromptBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-slate-500">프롬프트</label>
      <textarea
        className="min-h-[72px] max-h-[120px] p-3 border border-slate-300 rounded-lg resize-none text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
      >
        {loading ? "처리 중..." : "AI 수정 적용"}
      </button>
    </div>
  );
}
