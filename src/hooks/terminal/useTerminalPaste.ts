import { useCallback, useRef } from "react";
import { ptyWrite } from "../../lib/pty";

const PASTE_CHUNK_SIZE = 4096;
const PASTE_CHUNK_DELAY_MS = 10;

interface UseTerminalPasteParams {
  handleRef: React.MutableRefObject<number | null>;
}

/**
 * Provides a `writeChunked` callback that sends data to the PTY in
 * serialized, size-limited chunks to prevent buffer overflow on large pastes.
 */
export function useTerminalPaste({ handleRef }: UseTerminalPasteParams) {
  const writeQueueRef = useRef(Promise.resolve());

  const writeChunked = useCallback(
    (data: string) => {
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        if (handleRef.current === null) return;
        if (data.length <= PASTE_CHUNK_SIZE) {
          await ptyWrite(handleRef.current, data).catch((err) => {
            console.warn("[Terminal] PTY write failed:", err);
          });
          return;
        }
        for (let i = 0; i < data.length; i += PASTE_CHUNK_SIZE) {
          if (handleRef.current === null) return;
          const chunk = data.slice(i, i + PASTE_CHUNK_SIZE);
          try {
            await ptyWrite(handleRef.current, chunk);
          } catch (err) {
            console.warn(
              "[Terminal] PTY chunk write failed, aborting paste:",
              err,
            );
            break;
          }
          if (i + PASTE_CHUNK_SIZE < data.length) {
            await new Promise((r) => setTimeout(r, PASTE_CHUNK_DELAY_MS));
          }
        }
      });
    },
    [handleRef],
  );

  return { writeChunked };
}
