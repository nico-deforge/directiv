import { useSettingsStore } from "../../stores/settingsStore";
import { OnboardingWizard } from "./OnboardingWizard";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const onboardingCompleted = useSettingsStore(
    (s) => s.config.onboardingCompleted,
  );

  if (onboardingCompleted) {
    return children;
  }

  return <OnboardingWizard />;
}
