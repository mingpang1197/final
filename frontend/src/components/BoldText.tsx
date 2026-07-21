import { parseStyledParts } from "../utils/richText";

export function StyledText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {parseStyledParts(text).map((part, i) => {
        const style = part.sizePt !== 12 ? { fontSize: `${part.sizePt}px` } : undefined;
        if (part.bold) {
          return (
            <strong key={i} className="font-bold" style={style}>
              {part.text}
            </strong>
          );
        }
        return (
          <span key={i} style={style}>
            {part.text}
          </span>
        );
      })}
    </span>
  );
}

/** @deprecated StyledText 사용 */
export function BoldText({ text, className }: { text: string; className?: string }) {
  return <StyledText text={text} className={className} />;
}
