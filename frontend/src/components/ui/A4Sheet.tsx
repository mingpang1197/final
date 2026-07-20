/**
 * A4 용지 비율(210×297mm) 콘텐츠 영역 — 패널 안에 한 페이지 분량이 보이도록 맞춤.
 */
import type { ReactNode } from "react";

interface A4SheetProps {
  children: ReactNode;
  className?: string;
}

export function A4Sheet({ children, className = "" }: A4SheetProps) {
  return (
    <div className="a4-viewport">
      <div className={`a4-sheet ${className}`}>{children}</div>
    </div>
  );
}
