import { useEffect, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { ptySpawn, ptyClose, PTY_EVENTS } from "../../lib/pty";
import type { PtyOutputEvent } from "../../lib/pty";
import type { Terminal } from "@xterm/xterm";
import { useTerminalStore } from "../../stores/terminalStore";

interface UseTerminalStreamParams {
  termRef: React.MutableRefObject<Terminal | null>;
  sessionName: string;
  handleRef: React.MutableRefObject<number | null>;
  writeChunked: (data: string) => void;
  enabled: boolean;
}

/**
 * Connects the terminal to a PTY via Tauri Channel.
 * Handles data streaming, keyboard input forwarding, and session lifecycle.
 */
export function useTerminalStream({
  termRef,
  sessionName,
  handleRef,
  writeChunked,
  enabled,
}: UseTerminalStreamParams) {
  const channelRef = useRef<Channel<PtyOutputEvent> | null>(null);

  useEffect(() => {
    const term = termRef.current;
    if (!enabled || !term) return;
    let cancelled = false;

    // Forward keyboard input to PTY (chunked for large pastes)
    const dataDisposable = term.onData((data) => {
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
          try {
            term.write(event.data.output);
          } catch (err) {
            console.warn(
              "[Terminal] term.write failed, output may be lost:",
              err,
            );
          }
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

    const cols = term.cols;
    const rows = term.rows;

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

    return () => {
      cancelled = true;
      dataDisposable.dispose();

      if (channelRef.current) {
        channelRef.current.onmessage = () => {};
        channelRef.current = null;
      }

      if (handleRef.current !== null) {
        ptyClose(handleRef.current).catch(() => {});
        handleRef.current = null;
      }
    };
  }, [enabled, sessionName, termRef, handleRef, writeChunked]);
}
