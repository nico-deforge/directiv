import { useState, useEffect } from "react";
import { ArrowDown } from "lucide-react";
import type { Terminal } from "@xterm/xterm";

interface ScrollToBottomButtonProps {
  term: Terminal | null;
}

export function ScrollToBottomButton({ term }: ScrollToBottomButtonProps) {
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  useEffect(() => {
    if (!term) return;

    const checkIfAtBottom = () => {
      const isAtBottom =
        term.buffer.active.viewportY >= term.buffer.active.baseY;
      setIsScrolledUp(!isAtBottom);
    };

    // Throttle onWriteParsed via rAF — it fires on every PTY output chunk
    let rafId: number | null = null;
    const scheduleCheck = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        checkIfAtBottom();
      });
    };

    const disposables = [
      term.onScroll(checkIfAtBottom),
      term.onWriteParsed(scheduleCheck),
    ];

    return () => {
      disposables.forEach((d) => d.dispose());
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [term]);

  if (!isScrolledUp || !term) return null;

  return (
    <button
      onClick={() => term.scrollToBottom()}
      className="absolute bottom-4 right-4 z-10 flex size-8 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-muted)] shadow-lg transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      title="Scroll to bottom (Cmd+End)"
    >
      <ArrowDown className="size-4" />
    </button>
  );
}
