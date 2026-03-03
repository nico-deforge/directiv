import type { MutableRefObject } from "react";
import type { ILinkProvider, ILink, Terminal } from "@xterm/xterm";

// Matches file paths like:
//   ./src/file.ts              src/file.ts
//   /absolute/path.rs          file.ts:42
//   file.ts:42:10              file.ts(42)
//   a/src/file.ts (git diff)   b/src/file.ts (git diff)
const FILE_PATH_RE =
  /(?:^|\s|['"`(])(?:\.\/|\/|[ab]\/)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?::(\d+)(?::(\d+))?|\((\d+)\))?/g;

// File extensions that indicate actual source files (not version numbers, etc.)
const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "scss",
  "html",
  "md",
  "mdx",
  "rs",
  "toml",
  "yaml",
  "yml",
  "py",
  "go",
  "rb",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "zsh",
  "bash",
  "fish",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "env",
  "lock",
  "conf",
  "cfg",
  "ini",
  "xml",
  "svg",
  "wasm",
  "tf",
  "hcl",
  "proto",
  "txt",
  "log",
  "csv",
]);

interface ParsedLink {
  file: string;
  line?: number;
  col?: number;
  startIndex: number;
  endIndex: number;
}

function parseLinks(lineText: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  FILE_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_PATH_RE.exec(lineText)) !== null) {
    const file = match[1];

    let line: number | undefined;
    if (match[2]) {
      line = parseInt(match[2], 10);
    } else if (match[4]) {
      line = parseInt(match[4], 10);
    }
    const col = match[3] ? parseInt(match[3], 10) : undefined;

    // Check extension
    const ext = file.split(".").pop()?.toLowerCase();
    if (!ext || !SOURCE_EXTENSIONS.has(ext)) continue;

    // Must have at least one path separator or be in a recognizable pattern
    if (!file.includes("/") && !line) continue;

    // Skip matches inside URLs
    const beforeMatch = lineText.slice(0, match.index);
    if (/https?:\/\/\S*$/.test(beforeMatch)) continue;

    // Find the actual position of the file path in the match
    const fullMatch = match[0];
    const fileStartInMatch = fullMatch.indexOf(file);
    const startIndex = match.index + Math.max(0, fileStartInMatch);

    // Calculate end: include :line:col or (line) suffix
    let endText = file;
    if (match[2]) {
      endText += ":" + match[2];
      if (match[3]) endText += ":" + match[3];
    } else if (match[4]) {
      endText += "(" + match[4] + ")";
    }
    const endIndex = startIndex + endText.length;

    links.push({ file, line, col, startIndex, endIndex });
  }

  return links;
}

export function createFilePathLinkProvider(
  terminal: Terminal,
  worktreeDirRef: MutableRefObject<string | undefined>,
  onActivate: (filePath: string, line?: number, col?: number) => void,
): ILinkProvider {
  return {
    provideLinks(
      bufferLineNumber: number,
      callback: (links: ILink[] | undefined) => void,
    ) {
      const buffer = terminal.buffer.active;
      const line = buffer.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const lineText = line.translateToString(true);
      const parsed = parseLinks(lineText);

      if (parsed.length === 0) {
        callback(undefined);
        return;
      }

      const worktreeDir = worktreeDirRef.current;

      const links: ILink[] = parsed.map((p) => ({
        range: {
          start: { x: p.startIndex + 1, y: bufferLineNumber },
          end: { x: p.endIndex, y: bufferLineNumber },
        },
        text:
          p.file + (p.line ? `:${p.line}` : "") + (p.col ? `:${p.col}` : ""),
        activate: () => {
          const resolved =
            p.file.startsWith("/") || !worktreeDir
              ? p.file
              : `${worktreeDir}/${p.file}`;
          onActivate(resolved, p.line, p.col);
        },
      }));

      callback(links);
    },
  };
}
