/**
 * Figma 워크플로 공통 레이아웃 (헤더 + stepper + 콘텐츠 카드).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChat } from "./icons";
import { StepIndicator, type WorkflowStep } from "./StepIndicator";

interface WorkflowLayoutProps {
  step: WorkflowStep;
  filename?: string;
  projectTitle?: string;
  prevNav?: { label: string; to: string };
  nextNav?: { label: string; to: string };
  error?: string;
  children: ReactNode;
  footerExtra?: ReactNode;
}

export function WorkflowLayout({
  step,
  filename,
  projectTitle = "Easy-Read 판결문 작성 보조",
  prevNav,
  nextNav,
  error,
  children,
  footerExtra,
}: WorkflowLayoutProps) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-coolgray-10 overflow-hidden">
      <header className="shrink-0 px-6 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold leading-snug text-coolgray-90 truncate">
            {projectTitle}
          </h1>
          {filename && (
            <span className="text-primary-60 font-medium text-sm tracking-wide shrink-0 max-w-[40%] truncate">
              {filename}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col mx-6 mb-4 min-h-0 bg-white border border-coolgray-20 overflow-hidden">
        <StepIndicator current={step} />

        {(prevNav || nextNav) && (
          <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-coolgray-20">
            {prevNav ? (
              <Link
                to={prevNav.to}
                className="inline-flex items-center gap-1 text-coolgray-60 hover:text-primary-60 font-medium text-sm"
              >
                <span className="text-base leading-none">‹</span>
                {prevNav.label}
              </Link>
            ) : (
              <span />
            )}
            {nextNav ? (
              <Link
                to={nextNav.to}
                className="inline-flex items-center gap-1 text-primary-60 hover:underline font-medium text-sm"
              >
                {nextNav.label}
                <span className="text-base leading-none">›</span>
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}

        {error && (
          <div className="shrink-0 mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

        {footerExtra}
      </div>

      <button
        type="button"
        className="fixed bottom-5 right-5 size-12 rounded-full bg-primary-60 border-2 border-primary-60 flex items-center justify-center shadow-lg hover:bg-primary-90 transition-colors"
        aria-label="도움말"
        title="도움말 (준비 중)"
      >
        <IconChat className="size-6" />
      </button>
    </div>
  );
}
