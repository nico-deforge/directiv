import { invoke } from "@tauri-apps/api/core";
import type { CodeEditor } from "../types";

/** Open a file in the user's configured editor, optionally at a line and column. */
export async function openInEditor(
  editor: CodeEditor,
  filePath: string,
  line?: number,
  col?: number,
): Promise<void> {
  let target = filePath;
  if (line) {
    target += `:${line}`;
    if (col) target += `:${col}`;
  }

  await invoke<void>("open_editor", { editor, path: target });
}
