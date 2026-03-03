import { useState, useRef, useEffect } from "react";
import { Search, X, ChevronUp, ChevronDown, CaseSensitive } from "lucide-react";
import type { SearchAddon } from "@xterm/addon-search";

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

export function TerminalSearch({ searchAddon, onClose }: TerminalSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Subscribe to result count updates
  useEffect(() => {
    if (!searchAddon) return;
    const disposable = searchAddon.onDidChangeResults(
      (e: { resultIndex: number; resultCount: number }) => {
        setResultIndex(e.resultIndex);
        setResultCount(e.resultCount);
      },
    );
    return () => disposable.dispose();
  }, [searchAddon]);

  function triggerSearch(q: string, cs: boolean) {
    if (!searchAddon) return;
    if (!q) {
      searchAddon.clearDecorations();
      setResultIndex(-1);
      setResultCount(0);
      return;
    }
    searchAddon.findNext(q, { caseSensitive: cs });
  }

  function findNext() {
    if (!searchAddon || !query) return;
    searchAddon.findNext(query, { caseSensitive });
  }

  function findPrev() {
    if (!searchAddon || !query) return;
    searchAddon.findPrevious(query, { caseSensitive });
  }

  function handleClose() {
    searchAddon?.clearDecorations();
    onClose();
  }

  function handleQueryChange(newQuery: string) {
    setQuery(newQuery);
    triggerSearch(newQuery, caseSensitive);
  }

  function handleCaseSensitiveToggle() {
    const next = !caseSensitive;
    setCaseSensitive(next);
    triggerSearch(query, next);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      findPrev();
    } else if (e.key === "Enter") {
      e.preventDefault();
      findNext();
    }
  };

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2 py-1.5 shadow-lg">
      <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search…"
        className="w-48 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
      {query && (
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
          {resultCount === 0
            ? "No results"
            : `${resultIndex + 1}/${resultCount}`}
        </span>
      )}
      <button
        onClick={handleCaseSensitiveToggle}
        className={`rounded p-0.5 transition-colors ${
          caseSensitive
            ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
        title="Case sensitive"
      >
        <CaseSensitive className="size-3.5" />
      </button>
      <button
        onClick={findPrev}
        className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        onClick={findNext}
        className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        title="Next (Enter)"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        onClick={handleClose}
        className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        title="Close (Escape)"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
