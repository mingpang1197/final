/**
 * Figma 워크플로 공통 레이아웃 (헤더 + stepper + 콘텐츠 카드).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChatbotWidget } from "./ChatbotWidget";
import { StepIndicator, type WorkflowStep } from "./StepIndicator";

interface WorkflowLayoutProps {
  step: WorkflowStep;
  docId?: string;
  filename?: string;
  projectTitle?: ReactNode;
  headerVariant?: "default" | "compact";
  prevNav?: { label: string; to: string };
  nextNav?: { label: string; to: string };
  error?: string;
  children: ReactNode;
  footerExtra?: ReactNode;
}

export function WorkflowLayout({
  step,
  docId,
  filename,
  projectTitle = "Easy-Read 판결문 작성 보조",
  headerVariant = "default",
  prevNav,
  nextNav,
  error,
  children,
  footerExtra,
}: WorkflowLayoutProps) {
  const compact = headerVariant === "compact";

  return (
    <div className="h-screen overflow-hidden bg-coolgray-10 flex flex-col">
      <div className={`px-6 ${compact ? "pt-4 pb-0" : "pt-6 pb-0"}`}>
        <div className={`flex items-start justify-between gap-6 ${compact ? "mb-3" : "mb-6"}`}>
          <h1
            className={`font-bold leading-tight text-coolgray-90 tracking-tight ${
              compact ? "text-[32px]" : "text-[42px]"
            }`}
          >
            {projectTitle}
          </h1>
          {filename && (
            <span
              className={`text-primary-60 font-medium text-base tracking-wide shrink-0 ${
                compact ? "pt-1" : "pt-2"
              }`}
            >
              {filename}
            </span>
          )}
        </div>
      </div>

      <div
        className={`flex-1 flex flex-col mx-6 min-h-0 bg-white border border-coolgray-20 overflow-hidden ${
          compact ? "mb-4" : "mb-6"
        }`}
      >
        <StepIndicator current={step} docId={docId} />

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
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">{children}</div>

        {footerExtra}
      </div>

      <ChatbotWidget docId={docId} />
    </div>
  );
}
