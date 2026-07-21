import {
  Children,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

export function CommunityMasonryGrid(props: {
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-community-masonry-item]"),
    );
    let frame = 0;

    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = getComputedStyle(root);
        const columnCount = Math.max(
          1,
          styles.gridTemplateColumns.split(" ").filter(Boolean).length,
        );
        const rowHeight = Number.parseFloat(styles.gridAutoRows) || 4;
        const rowGap = Number.parseFloat(styles.rowGap) || 0;
        const columnEnds = Array.from({ length: columnCount }, () => 1);

        items.forEach((item, index) => {
          const card = item.firstElementChild as HTMLElement | null;
          if (!card) return;
          const column = index % columnCount;
          const rowSpan = Math.max(
            1,
            Math.ceil((card.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap)),
          );
          const rowStart = columnEnds[column] ?? 1;
          item.style.gridColumnStart = String(column + 1);
          item.style.gridRowStart = String(rowStart);
          item.style.gridRowEnd = `span ${rowSpan}`;
          columnEnds[column] = rowStart + rowSpan;
        });
      });
    };

    const observer = new ResizeObserver(layout);
    observer.observe(root);
    items.forEach((item) => {
      const card = item.firstElementChild;
      if (card) observer.observe(card);
    });
    layout();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [props.children]);

  return (
    <div className={props.className} ref={rootRef}>
      {Children.map(props.children, (child) => (
        <div className="community-masonry-item" data-community-masonry-item>
          {child}
        </div>
      ))}
    </div>
  );
}
