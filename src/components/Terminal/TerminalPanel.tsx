import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
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
import "@xterm/xterm/css/xterm.css";

const TERMINAL_BG = "#282c34";

interface TerminalPanelProps {
  sessionName: string;
  isActive: boolean;
}

export function TerminalPanel({ sessionName, isActive }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const handleRef = useRef<number | null>(null);
  const channelRef = useRef<Channel<PtyOutputEvent> | null>(null);

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

  // Mount terminal and PTY connection
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const term = new Terminal({
      fontSize: 13,
      scrollback: 10_000,
      cursorBlink: true,
      macOptionIsMeta: true,
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

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        open(uri).catch(() => {});
      }),
    );

    // Wait for fonts to load before opening the terminal so xterm.js measures
    // character cells with the correct font metrics (avoids text cutoff and
    // red/green subpixel fringe artifacts when falling back to Menlo).
    const container = containerRef.current;
    document.fonts.ready.then(() => {
      if (cancelled || !container.isConnected) return;

      term.open(container);
      fitAddon.fit();

      const cols = term.cols;
      const rows = term.rows;

      // Forward keyboard input to PTY (registered eagerly — guarded by handleRef check)
      term.onData((data) => {
        if (handleRef.current !== null) {
          ptyWrite(handleRef.current, data).catch(() => {});
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

      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionName, fitAndResize]);

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
    />
  );
}
