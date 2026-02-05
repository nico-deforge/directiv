import { getBezierPath, useViewport } from "@xyflow/react";

interface DragConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hasValidTarget: boolean;
}

export function DragConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  hasValidTarget,
}: DragConnectionLineProps) {
  const { x, y, zoom } = useViewport();

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  const strokeColor = "#f59e0b";
  const opacity = hasValidTarget ? 1 : 0.6;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 1000 }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`} opacity={opacity}>
        {/* Origin circle at source handle */}
        <circle cx={fromX} cy={fromY} r={5 / zoom} fill={strokeColor} />
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3 / zoom}
        />
        <circle cx={toX} cy={toY} r={6 / zoom} fill={strokeColor} />
      </g>
    </svg>
  );
}
