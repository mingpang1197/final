/**
 * Figma 업로드 화면 — 기존 프로젝트 테이블 (UI 목업).
 */
import { IconChevronLeft, IconChevronRight } from "./icons";

const MOCK_ROWS = [
  { id: 1, name: "사건 1", subtitle: "Senior Designer" },
  { id: 2, name: "사건 2", subtitle: "Senior Designer" },
  { id: 3, name: "사건 3", subtitle: "Senior Designer" },
];

export function ExistingProjectsTable() {
  return (
    <section className="mx-5 mb-6 mt-6">
      <h2 className="text-lg font-bold text-coolgray-90 mb-4">기존 프로젝트</h2>

      <div className="border border-coolgray-20 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-coolgray-10 border-t border-coolgray-20">
                <th className="w-10 px-3 py-4 border-t border-coolgray-20">
                  <input type="checkbox" className="size-4 accent-primary-60" aria-label="전체 선택" />
                </th>
                <th className="px-3 py-4 text-left font-medium text-coolgray-90 border-t border-coolgray-20">
                  Author
                </th>
                {Array.from({ length: 4 }).map((_, i) => (
                  <th
                    key={i}
                    className="px-3 py-4 text-left font-medium text-coolgray-90 border-t border-coolgray-20 w-40"
                  >
                    Title
                  </th>
                ))}
                <th className="w-10 border-t border-coolgray-20" />
              </tr>
            </thead>
            <tbody>
              {MOCK_ROWS.map((row) => (
                <tr key={row.id} className="border-t border-coolgray-20">
                  <td className="px-3 py-3">
                    <input type="checkbox" className="size-4 accent-primary-60" aria-label={`${row.name} 선택`} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-coolgray-90">{row.name}</p>
                    <p className="text-xs text-coolgray-60">{row.subtitle}</p>
                  </td>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <td key={i} className="px-3 py-3 text-coolgray-90">
                      Cell Text
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    {row.id === 1 ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-coolgray-10 text-xs text-coolgray-90">
                        Badge
                      </span>
                    ) : (
                      <button type="button" className="text-coolgray-60 hover:text-coolgray-90 px-1" aria-label="더보기">
                        ···
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-center gap-1 py-3 border-t border-coolgray-20 text-base">
          <button type="button" className="inline-flex items-center gap-1 px-2 py-2 text-coolgray-60 hover:text-primary-60">
            <IconChevronLeft className="size-5" />
            Previous
          </button>
          {[1, 2, 3, 4, 5].map((page) => (
            <button
              key={page}
              type="button"
              className={`min-w-[40px] h-10 px-2 ${
                page === 2
                  ? "bg-[#a6c8ff] border-2 border-[#a6c8ff] text-primary-90 font-medium"
                  : "text-primary-60 hover:bg-coolgray-10"
              }`}
            >
              {page}
            </button>
          ))}
          <span className="px-2 text-primary-60">...</span>
          <button type="button" className="min-w-[40px] h-10 px-2 text-primary-60 hover:bg-coolgray-10">
            11
          </button>
          <button type="button" className="inline-flex items-center gap-1 px-2 py-2 text-primary-60 hover:bg-coolgray-10">
            Next
            <IconChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
