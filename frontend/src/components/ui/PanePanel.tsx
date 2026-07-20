/**
 * Figma 2-pane 패널 (원문/요약문 등).
 */
import type { ReactNode } from "react";

interface PanePanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function PanePanel({ title, children, className = "" }: PanePanelProps) {
  return (
    <section
      className={`flex flex-col h-full min-h-0 border border-coolgray-30 bg-white ${className}`}
    >
      <div className="shrink-0 px-4 py-2 border-b border-coolgray-20">
        <h2 className="text-center text-sm font-semibold text-coolgray-90">{title}</h2>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-2 overflow-hidden">{children}</div>
    </section>
  );
}
