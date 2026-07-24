/**
 * ERAI 브랜드 로고 — 헤더·로그인 등 공통 사용.
 */
type EraiLogoSize = "sm" | "compact" | "default";

const HEIGHT: Record<EraiLogoSize, string> = {
  sm: "h-8 max-w-[108px]",
  compact: "h-10 max-w-[140px]",
  default: "h-12 max-w-[168px]",
};

interface EraiLogoProps {
  className?: string;
  size?: EraiLogoSize;
}

export function EraiLogo({ className = "", size = "default" }: EraiLogoProps) {
  return (
    <img
      src="/assets/erai-logo.png"
      alt="ERAI Easy-Read AI"
      className={`w-auto object-contain object-left ${HEIGHT[size]} ${className}`.trim()}
    />
  );
}
