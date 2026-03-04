import { useCallback, useEffect } from "react";
import { ptyResize } from "../../lib/pty";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

const RESIZE_DEBOUNCE_MS = 100;

interface UseTerminalResizeParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  termRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  handleRef: React.MutableRefObject<number | null>;
  isActive: boolean;
  enabled: boolean;
}

/**
 * Handles terminal resize: FitAddon, ResizeObserver, DPI change detection,
 * and refit when the tab becomes visible.
 */
export function useTerminalResize({
  containerRef,
  termRef,
  fitAddonRef,
  handleRef,
  isActive,
  enabled,
}: UseTerminalResizeParams) {
  const fitAndResize = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current || !containerRef.current)
      return;
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
  }, [containerRef, termRef, fitAddonRef, handleRef]);

  // ResizeObserver + DPI change listener
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitAndResize, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);

    // DPI change listener — handles Retina ↔ external monitor transitions
    let dprMedia = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );
    const onDprChange = () => {
      try {
        fitAndResize();
      } catch (err) {
        console.warn("[Terminal] fitAndResize failed during DPI change:", err);
      }
      dprMedia.removeEventListener("change", onDprChange);
      dprMedia = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      dprMedia.addEventListener("change", onDprChange);
    };
    dprMedia.addEventListener("change", onDprChange);

    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      dprMedia.removeEventListener("change", onDprChange);
    };
  }, [enabled, containerRef, fitAndResize]);

  // Refit when tab becomes visible
  useEffect(() => {
    if (!enabled || !isActive) return;
    const timer = setTimeout(() => {
      fitAndResize();
      termRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [enabled, isActive, fitAndResize, termRef]);
}
