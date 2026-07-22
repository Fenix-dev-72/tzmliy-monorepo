import { useEffect, useRef, useState } from "react";

// Count-from-0 number animation, triggered the first time it scrolls into
// view. Plain requestAnimationFrame, no animation library. Respects
// prefers-reduced-motion by jumping straight to the final value.
export function CountUp({
  to,
  suffix = "",
  prefix = "",
  durationMs = 1200,
  decimals = 0,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  decimals?: number;
}) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(to);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(to * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to, durationMs]);

  const shown = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();

  return (
    <span ref={ref} className="font-mono">
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}
