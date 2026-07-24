/**
 * ERAI 브랜드 로고 — 헤더·로그인 등 공통 사용.
 * 가로형 배너(약 5:1)이므로 높이 기준으로 비율을 유지한다.
 */
type EraiLogoSize = "sm" | "compact" | "default" | "lg";

const HEIGHT: Record<EraiLogoSize, string> = {
  sm: "h-7",
  compact: "h-9",
  default: "h-11",
  lg: "h-14 sm:h-16",
};

interface EraiLogoProps {
  className?: string;
  size?: EraiLogoSize;
}

export function EraiLogo({ className = "", size = "default" }: EraiLogoProps) {
  return (
    <img
      src="/assets/erai-logo-banner.png?v=2"
      alt="ERAI"
      className={`block w-auto object-contain object-left ${HEIGHT[size]} ${className}`.trim()}
    />
  );
}
