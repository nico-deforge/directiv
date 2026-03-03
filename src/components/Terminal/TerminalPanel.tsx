import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { open } from "@tauri-apps/plugin-shell";
import { Channel } from "@tauri-apps/api/core";
import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyClose,
  PTY_EVENTS,
} from "../../lib/pty";
import type { PtyOutputEvent } from "../../lib/pty";
import { useTerminalStore } from "../../stores/terminalStore";
import { TerminalSearch } from "./TerminalSearch";
import "@xterm/xterm/css/xterm.css";

const TERMINAL_BG = "#282c34";

// Track WebGL failures globally so we don't retry on every terminal instance
let webglFailed = false;

/** Chunk large pastes to avoid overwhelming the PTY buffer. */
const PASTE_CHUNK_SIZE = 4096;
const PASTE_CHUNK_DELAY_MS = 10;

interface TerminalPanelProps {
  sessionName: string;
  isActive: boolean;
}

export function TerminalPanel({ sessionName, isActive }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const handleRef = useRef<number | null>(null);
  const channelRef = useRef<Channel<PtyOutputEvent> | null>(null);
  const writeQueueRef = useRef(Promise.resolve());

  const [showSearch, setShowSearch] = useState(false);

  const fitAndResize = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current || !containerRef.current)
      return;
    // Skip resize when the container is hidden (display: none → zero dimensions)
    if (
      containerRef.current.offsetHeight === 0 ||
      containerRef.current.offsetWidth === 0
    )
      return;
    fitAddonRef.current.fit();
    if (handleRef.current !== null) {
      ptyResize(
        handleRef.current,
        termRef.current.cols,
        termRef.current.rows,
      ).catch(() => {});
    }
  }, []);

  /** Send data to PTY in chunks to prevent buffer overflow on large pastes.
   *  Writes are serialized via a queue to prevent interleaving from concurrent calls. */
  const writeChunked = useCallback((data: string) => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      if (handleRef.current === null) return;
      if (data.length <= PASTE_CHUNK_SIZE) {
        await ptyWrite(handleRef.current, data).catch(() => {});
        return;
      }
      for (let i = 0; i < data.length; i += PASTE_CHUNK_SIZE) {
        if (handleRef.current === null) return;
        const chunk = data.slice(i, i + PASTE_CHUNK_SIZE);
        try {
          await ptyWrite(handleRef.current, chunk);
        } catch {
          break; // Stop sending chunks to a broken pipe
        }
        if (i + PASTE_CHUNK_SIZE < data.length) {
          await new Promise((r) => setTimeout(r, PASTE_CHUNK_DELAY_MS));
        }
      }
    });
  }, []);

  // Mount terminal and PTY connection
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const term = new Terminal({
      fontSize: 13,
      lineHeight: 1.05,
      scrollback: 10_000,
      cursorBlink: true,
      macOptionIsMeta: true,
      allowProposedApi: true,
      scrollSensitivity: 0.5,
      fastScrollSensitivity: 3,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: TERMINAL_BG,
        foreground: "#ffffff",
        cursor: "#ffffff",
        selectionBackground: "#444444",
      },
    });
    termRef.current = term;

    // --- Addons ---

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // Web links (URLs)
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        open(uri).catch(() => {});
      }),
    );

    // Search
    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    // Unicode 11
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";

    // --- Custom key event handler (Cmd+F, Cmd+K, Cmd+C copy trim) ---
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      if (!event.metaKey) return true;

      // Cmd+F → toggle search
      if (event.key === "f") {
        event.preventDefault();
        setShowSearch((prev) => !prev);
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
            (err) =>
              console.warn("[TerminalPanel] Clipboard write failed:", err),
          );
          return false;
        }
      }

      return true;
    });

    // Wait for fonts to load before opening the terminal so xterm.js measures
    // character cells with the correct font metrics (avoids text cutoff and
    // red/green subpixel fringe artifacts when falling back to Menlo).
    const container = containerRef.current;
    document.fonts.ready.then(() => {
      if (cancelled || !container.isConnected) return;

      term.open(container);
      fitAddon.fit();

      // --- WebGL renderer (loaded after open) ---
      if (!webglFailed) {
        requestAnimationFrame(() => {
          if (cancelled) return;
          import("@xterm/addon-webgl")
            .then(({ WebglAddon }) => {
              if (cancelled) return;
              const webglAddon = new WebglAddon();
              webglAddon.onContextLoss(() => {
                console.warn(
                  "[TerminalPanel] WebGL context lost, falling back to canvas",
                );
                webglAddon.dispose();
                webglFailed = true;
              });
              term.loadAddon(webglAddon);
            })
            .catch((err) => {
              webglFailed = true;
              console.warn(
                "[TerminalPanel] WebGL addon failed, using canvas:",
                err,
              );
            });
        });
      }

      const cols = term.cols;
      const rows = term.rows;

      // Forward keyboard input to PTY (chunked for large pastes)
      term.onData((data) => {
        if (handleRef.current !== null) {
          writeChunked(data);
        }
      });

      // Create Tauri Channel for PTY output
      const channel = new Channel<PtyOutputEvent>();
      channelRef.current = channel;

      channel.onmessage = (event: PtyOutputEvent) => {
        switch (event.event) {
          case PTY_EVENTS.DATA:
            term.write(event.data.output);
            break;
          case PTY_EVENTS.EXIT:
            term.write("\r\n[Session ended]\r\n");
            if (handleRef.current !== null) {
              ptyClose(handleRef.current).catch(() => {});
              handleRef.current = null;
            }
            useTerminalStore.getState().closeTerminal(sessionName);
            break;
          case PTY_EVENTS.ERROR:
            term.write(`\r\n[Error: ${event.data.message}]\r\n`);
            break;
        }
      };

      // Spawn PTY
      ptySpawn(sessionName, cols, rows, channel)
        .then((h) => {
          if (cancelled) {
            ptyClose(h).catch(() => {});
            return;
          }
          handleRef.current = h;
        })
        .catch((err) => {
          if (!cancelled) {
            term.write(`\r\n[Failed to connect: ${String(err)}]\r\n`);
          }
        });
    });

    // Resize observer
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitAndResize, 200);
    });
    observer.observe(container);

    // DPI change listener — handles Retina ↔ external monitor transitions
    // where container CSS size stays the same but devicePixelRatio changes
    let dprMedia = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );
    const onDprChange = () => {
      try {
        fitAndResize();
      } catch (err) {
        console.warn(
          "[TerminalPanel] fitAndResize failed during DPI change:",
          err,
        );
      }
      dprMedia.removeEventListener("change", onDprChange);
      dprMedia = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      dprMedia.addEventListener("change", onDprChange);
    };
    dprMedia.addEventListener("change", onDprChange);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      dprMedia.removeEventListener("change", onDprChange);

      // Prevent ghost listeners
      if (channelRef.current) {
        channelRef.current.onmessage = () => {};
        channelRef.current = null;
      }

      // Close PTY
      if (handleRef.current !== null) {
        ptyClose(handleRef.current).catch(() => {});
        handleRef.current = null;
      }

      // Some addons access internal terminal state during dispose — guard the teardown
      try {
        term.dispose();
      } catch {
        // Addon disposal may race with terminal core teardown
      }
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionName, fitAndResize, writeChunked]);

  // Refit when tab becomes visible
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      fitAndResize();
      termRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, fitAndResize]);

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
