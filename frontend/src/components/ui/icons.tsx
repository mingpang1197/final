/** Figma jam-icons 스타일 UI 아이콘 (inline SVG) */

export function IconChevronLeft({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M14 6L8 12L14 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronRight({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 6L16 12L10 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCheck({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5L9.5 17L19 7" stroke="#25A249" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCircle({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#C1C7CD" strokeWidth="2" />
    </svg>
  );
}

export function IconActiveStep({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#21272A" strokeWidth="2" />
      <path d="M12 7V12L15 14" stroke="#21272A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconArrowRight({ className = "size-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUploadCloud({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 4V20M16 4L10 10M16 4L22 10M6 22H26C27.1 22 28 22.9 28 24V26C28 27.1 27.1 28 26 28H6C4.9 28 4 27.1 4 26V24C4 22.9 4.9 22 6 22Z"
        stroke="#0F62FE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChat({ className = "size-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M4 4H20V16H8L4 20V4Z" />
    </svg>
  );
}
