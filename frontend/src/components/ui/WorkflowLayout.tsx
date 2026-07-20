/**
 * Figma 워크플로 공통 레이아웃.
 * 상단은 콘텐츠 높이만 사용하고, 화면이 줄면 본문(고정)을 제외한 나머지 높이 안에서 줄어듦.
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
    <div className="workflow-page bg-coolgray-10">
      <div className="workflow-top">
        <header className="px-6 pt-4 pb-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[42px] font-bold leading-tight text-coolgray-90 tracking-tight">
              {projectTitle}
            </h1>
            {filename && (
              <span className="text-primary-60 font-medium text-base tracking-wide shrink-0 pt-2 max-w-[40%] truncate">
                {filename}
              </span>
            )}
          </div>
        </header>

        <div className="mx-6 bg-white border border-coolgray-20 border-b-0">
          <StepIndicator current={step} />

          {(prevNav || nextNav) && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-coolgray-20">
              {prevNav ? (
                <Link
                  to={prevNav.to}
                  className="inline-flex items-center gap-1 text-coolgray-60 hover:text-primary-60 font-medium text-base"
                >
                  <span className="text-lg leading-none">‹</span>
                  {prevNav.label}
                </Link>
              ) : (
                <span />
              )}
              {nextNav ? (
                <Link
                  to={nextNav.to}
                  className="inline-flex items-center gap-1 text-primary-60 hover:underline font-medium text-base"
                >
                  {nextNav.label}
                  <span className="text-lg leading-none">›</span>
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}

          {error && (
            <div className="mx-4 my-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="workflow-body mx-6 bg-white border border-coolgray-20 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        {footerExtra}
      </div>

      <button
        type="button"
        className="fixed bottom-6 right-6 size-16 rounded-full bg-primary-60 border-2 border-primary-60 flex items-center justify-center shadow-lg hover:bg-primary-90 transition-colors"
        aria-label="도움말"
        title="도움말 (준비 중)"
      >
        <IconChat className="size-8" />
      </button>
    </div>
  );
}
