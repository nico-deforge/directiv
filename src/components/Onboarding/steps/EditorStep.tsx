import type { CodeEditor } from "../../../types";

const EDITORS: { value: CodeEditor; label: string; description: string }[] = [
  { value: "zed", label: "Zed", description: "Fast, collaborative editor" },
  {
    value: "cursor",
    label: "Cursor",
    description: "AI-powered code editor",
  },
  {
    value: "vscode",
    label: "VS Code",
    description: "Visual Studio Code",
  },
  {
    value: "code",
    label: "Code",
    description: "VS Code (code CLI)",
  },
];

export function EditorStep({
  editor,
  onChange,
}: {
  editor: CodeEditor;
  onChange: (editor: CodeEditor) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Choose your editor
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Select the code editor to open when clicking "Open in Editor".
        </p>
      </div>

      <div className="space-y-2">
        {EDITORS.map((e) => {
          const isSelected = editor === e.value;
          return (
            <button
              key={e.value}
              onClick={() => onChange(e.value)}
              className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                  : "border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
              }`}
            >
              <div
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  isSelected
                    ? "border-[var(--accent-blue)]"
                    : "border-[var(--border-default)]"
                }`}
              >
                {isSelected && (
                  <div className="size-2 rounded-full bg-[var(--accent-blue)]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {e.label}
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  {e.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
