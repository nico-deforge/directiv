import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { tmuxCapturePane } from "../../lib/tauri";

interface QuickPeekProps {
  sessionName: string;
  active: boolean;
  children: React.ReactNode;
}

const HOVER_DELAY = 500;
const MAX_LINES = 20;

function filterLines(raw: string): string[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-MAX_LINES);
}

export function QuickPeek({ sessionName, active, children }: QuickPeekProps) {
  const [hovering, setHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const enabled = hovering && active;

  const { data: rawOutput } = useQuery({
    queryKey: ["quick-peek", sessionName],
    queryFn: () => tmuxCapturePane(sessionName),
    enabled,
    staleTime: 0,
  });

  const lines = rawOutput ? filterLines(rawOutput) : [];

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovering(true), HOVER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHovering(false);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      {children}
      {enabled && lines.length > 0 && (
        <div className="absolute left-0 bottom-full z-30 mb-2 w-[420px] max-h-[300px] overflow-auto rounded-lg border border-[var(--border-default)] bg-[#1a1a2e] p-3 shadow-xl pointer-events-none">
          <pre className="text-[11px] leading-relaxed font-mono text-[#e0e0e0] whitespace-pre-wrap break-all">
            {lines.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
