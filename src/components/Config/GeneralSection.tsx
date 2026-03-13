import { Settings2 } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { CodeEditor, Theme, TerminalEmulator } from "../../types";

const EDITORS: { value: CodeEditor; label: string }[] = [
  { value: "zed", label: "Zed" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
  { value: "code", label: "Code" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const TERMINAL_EMULATORS: { value: TerminalEmulator; label: string }[] = [
  { value: "ghostty", label: "Ghostty" },
  { value: "iterm2", label: "iTerm2" },
];

export function GeneralSection() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);

  function handleEditorChange(editor: CodeEditor) {
    setConfig({ ...config, editor });
  }

  function handleThemeChange(theme: Theme) {
    setConfig({ ...config, theme });
  }

  function handleTerminalEmulatorChange(terminal: TerminalEmulator) {
    setConfig({ ...config, terminal });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          General
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Application preferences and display settings.
        </p>
      </div>

      {/* Editor */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Editor
          </h2>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3">
          <label className="mb-1 block text-sm text-[var(--text-muted)]">
            Default code editor
          </label>
          <select
            value={config.editor}
            onChange={(e) => handleEditorChange(e.target.value as CodeEditor)}
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {EDITORS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Theme */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Theme
          </h2>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3">
          <div className="flex gap-1 rounded-md bg-[var(--bg-primary)] p-1">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => handleThemeChange(t.value)}
                className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
                  config.theme === t.value
                    ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Terminal */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Terminal
          </h2>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3">
          <label className="mb-1 block text-sm text-[var(--text-muted)]">
            Terminal emulator
          </label>
          <select
            value={config.terminal}
            onChange={(e) =>
              handleTerminalEmulatorChange(e.target.value as TerminalEmulator)
            }
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TERMINAL_EMULATORS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
