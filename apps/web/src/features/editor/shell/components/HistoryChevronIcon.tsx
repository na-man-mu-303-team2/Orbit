type HistoryChevronIconProps = {
  className?: string;
  direction: "left" | "right";
};

const pathByDirection: Record<HistoryChevronIconProps["direction"], string> = {
  left: "M14 26L2 14L14 2",
  right: "M2 26L14 14L2 2"
};

export function HistoryChevronIcon({
  className,
  direction
}: HistoryChevronIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 16 28"
      fill="none"
    >
      <path
        d={pathByDirection[direction]}
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
