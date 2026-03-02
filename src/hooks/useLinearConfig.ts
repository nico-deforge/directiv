import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { LinearOrgConfig } from "../types";

export function useLinearOrgId(): string | null {
  return useAuthStore((s) => s.linearOrgId);
}

export function useCurrentLinearConfig(): LinearOrgConfig | null {
  const orgId = useAuthStore((s) => s.linearOrgId);
  const linear = useSettingsStore((s) => s.config.linear);
  if (!orgId) return null;
  return linear[orgId] ?? null;
}

export function useCurrentLinearTeamIds(): string[] {
  const orgId = useAuthStore((s) => s.linearOrgId);
  const linear = useSettingsStore((s) => s.config.linear);
  if (!orgId) return [];
  return linear[orgId]?.teamIds ?? [];
}
