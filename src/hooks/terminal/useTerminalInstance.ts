import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { open } from "@tauri-apps/plugin-shell";
import { suppressQueryResponses } from "../../lib/suppressQueryResponses";
import "@xterm/xterm/css/xterm.css";

export const TERMINAL_BG = "#282c34";

const WHEEL_PIXELS_PER_LINE = 40;
/**
 * After a Shift+scroll gesture ends, macOS trackpads keep firing momentum
 * (inertia) wheel events WITHOUT shiftKey. If those reach the TUI via mouse
 * tracking they defocus Claude Code's UI. We intercept wheel events for a
 * sliding cooldown after the last intercepted scroll tick, redirecting them
 * to the xterm viewport instead of letting them reach the TUI.
 */
const SHIFT_SCROLL_COOLDOWN_MS = 600;
const WRITE_DEPTH_WARN_THRESHOLD = 50;

// Track WebGL failures globally so we don't retry on every terminal instance
let webglFailed = false;

interface UseTerminalInstanceParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Creates and configures the xterm.js Terminal instance with all addons.
 * Returns refs to the terminal and key addons, plus an `isReady` flag
 * that becomes true after `term.open()` and font loading complete.
 */
export function useTerminalInstance({
  containerRef,
}: UseTerminalInstanceParams) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const term = new Terminal({
      fontSize: 13,
      lineHeight: 1.05,
      scrollback: 10_000,
      cursorBlink: true,
      macOptionIsMeta: true,
      rescaleOverlappingGlyphs: true,
      allowProposedApi: true,
      scrollSensitivity: 0.5,
      fastScrollSensitivity: 3,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: TERMINAL_BG,
        foreground: "#ffffff",
        cursor: "#ffffff",
        selectionBackground: "#444444",
        // Tomorrow Night ANSI palette (Ghostty defaults)
        black: "#1d1f21",
        red: "#cc6666",
        green: "#b5bd68",
        yellow: "#f0c674",
        blue: "#81a2be",
        magenta: "#b294bb",
        cyan: "#8abeb7",
        white: "#c5c8c6",
        brightBlack: "#666666",
        brightRed: "#d54e53",
        brightGreen: "#b9ca4a",
        brightYellow: "#e7c547",
        brightBlue: "#7aa6da",
        brightMagenta: "#c397d8",
        brightCyan: "#70c0b1",
        brightWhite: "#eaeaea",
      },
    });
    termRef.current = term;

    // Shift+scroll → scroll the xterm viewport even when mouse tracking is
    // active (e.g. Claude Code's TUI captures all wheel events for menu
    // navigation, preventing terminal buffer scrollback).
    let shiftScrollCooldown = 0;
    term.attachCustomWheelEventHandler((ev) => {
      if (!term.element) return true;
      if (term.modes.mouseTrackingMode === "none") return true;

      const inCooldown = Date.now() < shiftScrollCooldown;
      const isAtBottom =
        term.buffer.active.viewportY >= term.buffer.active.baseY;
      if (!ev.shiftKey && !inCooldown && isAtBottom) return true;
      if (ev.deltaY === 0) return true;

      const lines =
        Math.round(ev.deltaY / WHEEL_PIXELS_PER_LINE) ||
        (ev.deltaY > 0 ? 1 : -1);
      term.scrollLines(lines);
      if (ev.shiftKey) term.focus();
      if (ev.shiftKey || inCooldown) {
        shiftScrollCooldown = Date.now() + SHIFT_SCROLL_COOLDOWN_MS;
      }
      ev.stopPropagation();
      ev.preventDefault();
      return false;
    });

    // --- Addons ---

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        open(uri).catch(() => {});
      }),
    );

    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";

    try {
      term.loadAddon(new ClipboardAddon());
    } catch (err) {
      console.warn("[Terminal] ClipboardAddon failed, OSC 52 disabled:", err);
    }

    // Wait for fonts then open the terminal
    const container = containerRef.current;
    let querySupp: { dispose: () => void } | null = null;

    document.fonts.ready.then(() => {
      if (cancelled || !container.isConnected) return;

      term.open(container);
      querySupp = suppressQueryResponses(term);
      fitAddon.fit();

      term.onWriteParsed(() => {
        const depth = term.buffer.active.length;
        if (depth > WRITE_DEPTH_WARN_THRESHOLD) {
          // Intentionally left as debug — only visible when DevTools is open
        }
      });

      // WebGL renderer (loaded after open)
      if (!webglFailed) {
        requestAnimationFrame(() => {
          if (cancelled) return;
          import("@xterm/addon-webgl")
            .then(({ WebglAddon }) => {
              if (cancelled) return;
              const webglAddon = new WebglAddon();
              webglAddon.onContextLoss(() => {
                console.warn(
                  "[Terminal] WebGL context lost, falling back to DOM renderer",
                );
                webglAddon.dispose();
                webglFailed = true;
              });
              term.loadAddon(webglAddon);
            })
            .catch((err) => {
              webglFailed = true;
              console.warn(
                "[Terminal] WebGL addon failed, using DOM renderer:",
                err,
              );
            });
        });
      }

      setIsReady(true);
    });

    return () => {
      cancelled = true;
      setIsReady(false);
      querySupp?.dispose();
      try {
        term.dispose();
      } catch {
        // Addon disposal may race with terminal core teardown
      }
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { termRef, fitAddonRef, searchAddonRef, isReady };
}
