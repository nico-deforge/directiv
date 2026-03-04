import { useRef, useState, useCallback } from "react";
import {
  useTerminalInstance,
  useTerminalPaste,
  useTerminalKeyboard,
  useTerminalStream,
  useTerminalResize,
  TERMINAL_BG,
} from "../../hooks/terminal";
import { TerminalSearch } from "./TerminalSearch";

interface TerminalPanelProps {
  sessionName: string;
  isActive: boolean;
}

export function TerminalPanel({ sessionName, isActive }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const { termRef, fitAddonRef, searchAddonRef, isReady } = useTerminalInstance(
    { containerRef },
  );

  const { writeChunked } = useTerminalPaste({ handleRef });

  const onToggleSearch = useCallback(() => setShowSearch((prev) => !prev), []);

  useTerminalKeyboard({
    termRef,
    handleRef,
    writeChunked,
    onToggleSearch,
    enabled: isReady,
  });

  useTerminalStream({
    termRef,
    sessionName,
    handleRef,
    writeChunked,
    enabled: isReady,
  });

  useTerminalResize({
    containerRef,
    termRef,
    fitAddonRef,
    handleRef,
    isActive,
    enabled: isReady,
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ backgroundColor: TERMINAL_BG, overscrollBehavior: "contain" }}
    >
      {showSearch && (
        <TerminalSearch
          searchAddon={searchAddonRef.current}
          onClose={() => {
            setShowSearch(false);
            termRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
