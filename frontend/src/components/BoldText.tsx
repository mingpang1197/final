import { splitBoldParts } from "../utils/richText";

export function BoldText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitBoldParts(text).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part.replace(/\*\*/g, "")}</span>;
      })}
    </span>
  );
}
