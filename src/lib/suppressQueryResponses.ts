import type { Terminal, IDisposable } from "@xterm/xterm";

/**
 * Suppress CSI response sequences that would otherwise appear as visual
 * artifacts when echoed back through the PTY (e.g. cursor position reports
 * from Claude Code's TUI).
 *
 * Only suppresses sequences where the response uses a different final byte
 * than the query, so interception is unambiguous.
 */
export function suppressQueryResponses(term: Terminal): IDisposable {
  const disposables: IDisposable[] = [];

  // CSI R — Cursor Position Report (response to CSI 6 n)
  disposables.push(term.parser.registerCsiHandler({ final: "R" }, () => true));

  // CSI I — Focus In report (mode 1004)
  disposables.push(term.parser.registerCsiHandler({ final: "I" }, () => true));

  // CSI O — Focus Out report (mode 1004)
  disposables.push(term.parser.registerCsiHandler({ final: "O" }, () => true));

  // CSI $ y — DECRPM mode report (response to CSI ? Ps $ p)
  disposables.push(
    term.parser.registerCsiHandler(
      { intermediates: "$", final: "y" },
      () => true,
    ),
  );

  return {
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
