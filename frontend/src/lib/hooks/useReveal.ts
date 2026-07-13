import { useEffect, useRef, useState } from "react";

export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

export function revealClass(visible: boolean, extra = "") {
  return `transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${extra}`;
}

type Direction = "up" | "left" | "right" | "scale" | "blur";

const directionMap: Record<Direction, { hidden: string; visible: string }> = {
  up: { hidden: "translate-y-8 opacity-0", visible: "translate-y-0 opacity-100" },
  left: { hidden: "-translate-x-8 opacity-0", visible: "translate-x-0 opacity-100" },
  right: { hidden: "translate-x-8 opacity-0", visible: "translate-x-0 opacity-100" },
  scale: { hidden: "scale-92 opacity-0", visible: "scale-100 opacity-100" },
  blur: { hidden: "opacity-0 blur-sm scale-95", visible: "opacity-100 blur-0 scale-100" },
};

export function revealDirClass(visible: boolean, direction: Direction = "up", extra = "") {
  const d = directionMap[direction];
  return `transition-all duration-700 ease-out ${visible ? d.visible : d.hidden} ${extra}`;
}
