import { getBezierPath, useViewport } from "@xyflow/react";

interface DragConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hasValidTarget: boolean;
  color?: string;
}

export function DragConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  hasValidTarget,
  color = "#737373",
}: DragConnectionLineProps) {
  const { x, y, zoom } = useViewport();

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  const strokeColor = color;
  const opacity = hasValidTarget ? 0.8 : 0.4;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 1000 }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`} opacity={opacity}>
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
        />
        {hasValidTarget && (
          <circle cx={toX} cy={toY} r={4 / zoom} fill={strokeColor} />
        )}
      </g>
    </svg>
  );
}
