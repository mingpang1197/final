/**
 * Figma 5단계 워크플로 stepper (업로드→요약→번역→그림→추출).
 */
import { IconActiveStep, IconCheck, IconCircle } from "./icons";

export type WorkflowStep = "upload" | "summary" | "translate" | "images" | "export";

const STEPS: { id: WorkflowStep; label: string }[] = [
  { id: "upload", label: "1. 업로드" },
  { id: "summary", label: "2. 요약" },
  { id: "translate", label: "3. 번역" },
  { id: "images", label: "4. 그림" },
  { id: "export", label: "5. 추출" },
];

function stepIndex(step: WorkflowStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

interface StepIndicatorProps {
  current: WorkflowStep;
}

export function StepIndicator({ current }: StepIndicatorProps) {
  const currentIdx = stepIndex(current);

  return (
    <div className="shrink-0 flex border-b border-coolgray-20 bg-white">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const pending = idx > currentIdx;

        let borderClass = "border-t-2 border-coolgray-30";
        let bgClass = "bg-white";
        if (done) {
          borderClass = "border-t-2 border-primary-90 bg-coolgray-10";
        } else if (active) {
          borderClass = "border-t-2 border-coolgray-90 bg-white";
        }

        return (
          <div
            key={step.id}
            className={`flex flex-1 items-center gap-1.5 px-2 py-2 min-w-0 ${borderClass} ${bgClass}`}
          >
            <div className="shrink-0">
              {done ? (
                <IconCheck className="size-4" />
              ) : active ? (
                <IconActiveStep className="size-4" />
              ) : (
                <IconCircle className="size-4" />
              )}
            </div>
            <p
              className={`text-xs font-medium leading-none truncate ${
                pending ? "text-coolgray-40" : "text-coolgray-90"
              }`}
            >
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
