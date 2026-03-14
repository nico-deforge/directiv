const DEFAULT_PADDING = 8;

/**
 * Clamps a context-menu position so the menu stays fully inside the viewport.
 * Call this after the menu has been measured (width/height are known).
 */
export function clampToViewport({
  x,
  y,
  width,
  height,
  padding = DEFAULT_PADDING,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  padding?: number;
}): { x: number; y: number } {
  const maxX = window.innerWidth - width - padding;
  const maxY = window.innerHeight - height - padding;

  return {
    x: Math.max(padding, Math.min(x, maxX)),
    y: Math.max(padding, Math.min(y, maxY)),
  };
}
