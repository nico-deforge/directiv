import { getSmoothStepPath, useViewport } from "@xyflow/react";

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

  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  const strokeColor = hasValidTarget ? "#f59e0b" : "#6b7280";

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 1000 }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3 / zoom}
          strokeDasharray={hasValidTarget ? "none" : `${8 / zoom} ${4 / zoom}`}
        />
        <circle
          cx={toX}
          cy={toY}
          r={6 / zoom}
          fill={strokeColor}
        />
      </g>
    </svg>
  );
}
