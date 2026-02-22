import { invoke, Channel } from "@tauri-apps/api/core";

export const PTY_EVENTS = {
  DATA: "Data",
  EXIT: "Exit",
  ERROR: "Error",
} as const;

export type PtyOutputEvent =
  | { event: "Data"; data: { output: string } }
  | { event: "Exit"; data: { code: number | null } }
  | { event: "Error"; data: { message: string } };

export function ptySpawn(
  session: string,
  cols: number,
  rows: number,
  onData: Channel<PtyOutputEvent>,
): Promise<number> {
  return invoke<number>("pty_spawn", { session, cols, rows, onData });
}

export function ptyWrite(handle: number, data: string): Promise<void> {
  return invoke<void>("pty_write", { handle, data });
}

export function ptyResize(
  handle: number,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke<void>("pty_resize", { handle, cols, rows });
}

export function ptyClose(handle: number): Promise<void> {
  return invoke<void>("pty_close", { handle });
}
