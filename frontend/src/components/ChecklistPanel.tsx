import type { ChecklistReport } from "../api/client";

const STATUS_STYLE: Record<string, string> = {
  pass: "text-green-700 bg-green-50 border-green-200",
  warn: "text-amber-800 bg-amber-50 border-amber-200",
  fail: "text-red-700 bg-red-50 border-red-200",
  manual: "text-slate-600 bg-slate-50 border-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  pass: "통과",
  warn: "주의",
  fail: "수정 필요",
  manual: "수동 확인",
};

interface Props {
  checklist: ChecklistReport | null | undefined;
  onRecheck?: () => void;
  loading?: boolean;
}

export function ChecklistPanel({ checklist, onRecheck, loading }: Props) {
  if (!checklist) {
    return (
      <div className="text-xs text-slate-500 border rounded-lg p-3 bg-white">
        번역 후 체크리스트가 자동 실행됩니다.
      </div>
    );
  }

  const { overall, summary, items } = checklist;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
        <div>
          <h3 className="text-sm font-medium">이지리드 체크리스트</h3>
          <p className="text-xs text-slate-500">
            통과 {summary.pass} · 주의 {summary.warn} · 수정 {summary.fail} · 수동{" "}
            {summary.manual}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_STYLE[overall]}`}
          >
            {overall === "pass" ? "출력 가능" : overall === "warn" ? "검토 권장" : "수정 필요"}
          </span>
          {onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              disabled={loading}
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 disabled:opacity-50"
            >
              재검사
            </button>
          )}
        </div>
      </div>
      <ul className="max-h-40 overflow-auto divide-y text-xs">
        {items.map((item) => (
          <li key={item.id} className="px-3 py-1.5 flex gap-2 items-start">
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded border ${STATUS_STYLE[item.status]}`}
            >
              {STATUS_LABEL[item.status]}
            </span>
            <div>
              <p className="text-slate-800">{item.label}</p>
              {item.detail && <p className="text-slate-500 mt-0.5">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
