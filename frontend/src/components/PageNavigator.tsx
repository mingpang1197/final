interface PageNavigatorProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
}

export function PageNavigator({ current, total, onChange }: PageNavigatorProps) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2 text-sm">
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
        className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
      >
        이전
      </button>
      <span>
        {current} / {total}
      </span>
      <button
        type="button"
        disabled={current >= total}
        onClick={() => onChange(current + 1)}
        className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
      >
        다음
      </button>
    </div>
  );
}
