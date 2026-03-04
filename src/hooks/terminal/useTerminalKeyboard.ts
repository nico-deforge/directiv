import { useEffect } from "react";
import type { Terminal } from "@xterm/xterm";

interface UseTerminalKeyboardParams {
  termRef: React.MutableRefObject<Terminal | null>;
  handleRef: React.MutableRefObject<number | null>;
  writeChunked: (data: string) => void;
  onToggleSearch: () => void;
  enabled: boolean;
}

/**
 * Attaches the custom key event handler for terminal shortcuts:
 * Shift+Enter, Cmd+F/K/C, Cmd+Backspace, Cmd+Left/Right.
 */
export function useTerminalKeyboard({
  termRef,
  handleRef,
  writeChunked,
  onToggleSearch,
  enabled,
}: UseTerminalKeyboardParams) {
  useEffect(() => {
    const term = termRef.current;
    if (!enabled || !term) return;

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Shift+Enter → ESC+CR (line continuation in Claude Code)
      if (
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        if (handleRef.current !== null) writeChunked("\x1b\r");
        return false;
      }

      if (!event.metaKey) return true;

      // Cmd+F → toggle search
      if (event.key === "f") {
        event.preventDefault();
        onToggleSearch();
        return false;
      }

      // Cmd+K → clear scrollback
      if (event.key === "k") {
        event.preventDefault();
        term.clear();
        return false;
      }

      // Cmd+C → copy with trailing whitespace trimmed, then clear selection
      if (event.key === "c") {
        const selection = term.getSelection();
        if (selection) {
          const trimmed = selection
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n");
          navigator.clipboard.writeText(trimmed).then(
            () => term.clearSelection(),
            (err) => console.warn("[Terminal] Clipboard write failed:", err),
          );
          return false;
        }
      }

      // Cmd+Backspace → Ctrl+U (kill line backward)
      if (event.key === "Backspace") {
        event.preventDefault();
        if (handleRef.current !== null) writeChunked("\x15");
        return false;
      }

      // Cmd+Left → Ctrl+A (beginning of line)
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (handleRef.current !== null) writeChunked("\x01");
        return false;
      }

      // Cmd+Right → Ctrl+E (end of line)
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (handleRef.current !== null) writeChunked("\x05");
        return false;
      }

      return true;
    });
  }, [enabled, termRef, handleRef, writeChunked, onToggleSearch]);
}
