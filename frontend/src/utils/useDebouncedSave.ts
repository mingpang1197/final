import { useEffect, useRef } from "react";

/** Debounced side effect; skips the first run when skipInitial is true. */
export function useDebouncedSave(
  value: unknown,
  save: () => void | Promise<void>,
  delayMs = 800,
  skipInitial = true,
) {
  const ready = useRef(!skipInitial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void Promise.resolve(save()).catch(console.error);
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, save, delayMs]);
}
