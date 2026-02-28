import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { WorkspaceConfig, CodeEditor } from "../../types";
import { WorkspacesStep } from "./steps/WorkspacesStep";
import { LinearTeamsStep } from "./steps/LinearTeamsStep";
import { EditorStep } from "./steps/EditorStep";

const STEP_COUNT = 3;

export function OnboardingWizard() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);

  const [step, setStep] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(
    config.workspaces,
  );
  const [teamKeys, setTeamKeys] = useState<string[]>(config.linear.teamIds);
  const [editor, setEditor] = useState<CodeEditor>(config.editor);

  function saveCurrentStep() {
    if (step === 0) {
      setConfig({ ...config, workspaces });
    } else if (step === 1) {
      setConfig({ ...config, linear: { ...config.linear, teamIds: teamKeys } });
    } else if (step === 2) {
      setConfig({ ...config, editor });
    }
  }

  function handleNext() {
    saveCurrentStep();
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
    } else {
      setConfig({ ...config, editor, onboardingCompleted: true });
    }
  }

  function handleBack() {
    saveCurrentStep();
    setStep(step - 1);
  }

  function handleSkip() {
    setConfig({ ...config, onboardingCompleted: true });
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-[var(--accent-blue)]"
                  : i < step
                    ? "w-1.5 bg-[var(--accent-blue)]/50"
                    : "w-1.5 bg-[var(--border-default)]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px]">
          {step === 0 && (
            <WorkspacesStep workspaces={workspaces} onChange={setWorkspaces} />
          )}
          {step === 1 && (
            <LinearTeamsStep selectedKeys={teamKeys} onChange={setTeamKeys} />
          )}
          {step === 2 && <EditorStep editor={editor} onChange={setEditor} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div>
            {step > 0 ? (
              <button
                onClick={handleBack}
                className="rounded-md px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Back
              </button>
            ) : (
              <div />
            )}
          </div>
          <div className="flex items-center gap-2">
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
