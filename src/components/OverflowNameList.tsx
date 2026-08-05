import React, { useLayoutEffect, useRef, useState } from "react";
import { formatOverflowList } from "../utils/formatOverflowList";

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  if (!sharedMeasureCanvas) sharedMeasureCanvas = document.createElement("canvas");
  const ctx = sharedMeasureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

type Props = {
  names: string[];
  empty?: string;
  className?: string;
};

/** Fits as many names as the cell width allows, then "+N more". Full list in title. */
export const OverflowNameList: React.FC<Props> = ({
  names,
  empty = "—",
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(() =>
    names.length === 0 ? empty : formatOverflowList(names, Math.min(2, names.length))
  );

  const namesKey = names.join("\0");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      if (names.length === 0) {
        setDisplay(empty);
        return;
      }
      const available = el.clientWidth;
      const style = window.getComputedStyle(el);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (available <= 0) {
        setDisplay(formatOverflowList(names, 1));
        return;
      }
      let best = formatOverflowList(names, 1);
      for (let n = names.length; n >= 1; n -= 1) {
        const candidate = formatOverflowList(names, n);
        if (measureTextWidth(candidate, font) <= available) {
          best = candidate;
          break;
        }
      }
      setDisplay(best);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // namesKey is a stable content fingerprint; names is read from the latest render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, empty]);

  return (
    <div
      ref={ref}
      className={className ? `overflow-name-list ${className}` : "overflow-name-list"}
      title={names.length > 0 ? names.join(", ") : undefined}
    >
      {display}
    </div>
  );
};
