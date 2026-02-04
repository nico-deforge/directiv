import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "../stores/settingsStore";
import { listSkills, readSkillFile } from "../lib/tauri";
import type { SkillsResult } from "../types";

export function useSkills() {
  const repos = useSettingsStore((s) => s.config.repos);

  return useQuery<SkillsResult>({
    queryKey: ["skills", repos.map((r) => r.id).join(",")],
    queryFn: async () => {
      const repoPaths: [string, string][] = repos.map((r) => [r.id, r.path]);
      return listSkills(repoPaths);
    },
    staleTime: 60_000,
  });
}

export function useSkillFile(skillPath: string, filename: string) {
  return useQuery<string>({
    queryKey: ["skill-file", skillPath, filename],
    queryFn: () => readSkillFile(skillPath, filename),
    enabled: !!skillPath && !!filename,
    staleTime: 60_000,
  });
}
