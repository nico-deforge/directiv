import { useQuery } from "@tanstack/react-query";
import { listPluginSkills, readPluginSkillFile } from "../lib/tauri";
import type { PluginSkillInfo } from "../types";

export function usePluginSkills() {
  return useQuery<PluginSkillInfo[]>({
    queryKey: ["plugin-skills"],
    queryFn: listPluginSkills,
    staleTime: 60_000,
  });
}

export function usePluginSkillFile(skillName: string, filename: string) {
  return useQuery<string>({
    queryKey: ["plugin-skill-file", skillName, filename],
    queryFn: () => readPluginSkillFile(skillName, filename),
    enabled: !!skillName && !!filename,
    staleTime: 60_000,
  });
}
