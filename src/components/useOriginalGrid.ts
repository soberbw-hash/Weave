import { useLayoutEffect, type RefObject } from "react";
import { originalRowSpan } from "../services/libraryLayout";

/** One observer per grid; intrinsic card heights remain independent of row spans. */
export function useOriginalGrid(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  ids: string,
) {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!enabled || !grid) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    let frame = 0;
    const measure = () => {
      const css = getComputedStyle(grid);
      const row = parseFloat(css.gridAutoRows) || 1,
        gap = parseFloat(css.rowGap) || 0;
      const spans = cards.map((card) =>
        originalRowSpan(card.getBoundingClientRect().height, row, gap),
      );
      cards.forEach((card, i) => {
        card.style.gridRowEnd = `span ${spans[i]}`;
      });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    cards.forEach((card) => observer.observe(card));
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      cards.forEach((card) => card.style.removeProperty("grid-row-end"));
    };
  }, [ref, enabled, ids]);
}
