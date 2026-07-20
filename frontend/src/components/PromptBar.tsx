/**
 * AI 수정 프롬프트 입력 바 (Figma 스타일).
 */
import { IconArrowRight } from "./ui/icons";

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
  placeholder = "수정 사항을 입력하세요",
}: PromptBarProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-sm text-coolgray-90">AI 프롬프트</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 h-12 px-4 bg-coolgray-10 border-b border-coolgray-30 text-base text-coolgray-90 placeholder:text-coolgray-60 outline-none focus:border-primary-60"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && value.trim()) onSubmit();
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="size-10 shrink-0 flex items-center justify-center text-primary-60 disabled:opacity-40 hover:bg-coolgray-10 rounded transition-colors"
          aria-label="AI 수정 적용"
        >
          <IconArrowRight className="size-6" />
        </button>
      </div>
    </div>
  );
}
