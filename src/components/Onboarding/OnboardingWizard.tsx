import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { WorkspaceConfig, CodeEditor } from "../../types";
import { WorkspacesStep } from "./steps/WorkspacesStep";
import { LinearTeamsStep } from "./steps/LinearTeamsStep";
import { EditorStep } from "./steps/EditorStep";

const STEP_COUNT = 3;

function stepDotClass(i: number, current: number): string {
  if (i === current) return "w-6 bg-[var(--accent-blue)]";
  if (i < current) return "w-1.5 bg-[var(--accent-blue)]/50";
  return "w-1.5 bg-[var(--border-default)]";
}

export function OnboardingWizard() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);

  const [step, setStep] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(
    config.workspaces,
  );
  const [teamKeys, setTeamKeys] = useState<string[]>(config.linear.teamIds);
  const [editor, setEditor] = useState<CodeEditor>(config.editor);

  function saveAllState(extra?: Partial<{ onboardingCompleted: boolean }>) {
    setConfig({
      ...useSettingsStore.getState().config,
      workspaces,
      linear: { ...config.linear, teamIds: teamKeys },
      editor,
      ...extra,
    });
  }

  function handleNext() {
    if (step < STEP_COUNT - 1) {
      saveAllState();
      setStep(step + 1);
    } else {
      saveAllState({ onboardingCompleted: true });
    }
  }

  function handleBack() {
    saveAllState();
    setStep(step - 1);
  }

  function handleSkip() {
    saveAllState({ onboardingCompleted: true });
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${stepDotClass(i, step)}`}
            />
          ))}
        </div>

        <div className="min-h-[300px]">
          {step === 0 && (
            <WorkspacesStep workspaces={workspaces} onChange={setWorkspaces} />
          )}
          {step === 1 && (
            <LinearTeamsStep selectedKeys={teamKeys} onChange={setTeamKeys} />
          )}
          {step === 2 && <EditorStep editor={editor} onChange={setEditor} />}
        </div>

        <div className="flex items-center justify-between">
          {step > 0 && (
            <button
              onClick={handleBack}
              className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              Back
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              Skip for now
            </button>
            <button
              onClick={handleNext}
              className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
            >
              {step === STEP_COUNT - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
