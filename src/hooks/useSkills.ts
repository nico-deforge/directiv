import { useQuery } from "@tanstack/react-query";
import {
  listPluginSkills,
  readPluginSkillFile,
  listAllClaudeSkills,
} from "../lib/tauri";
import type { ClaudeSkillEntry, PluginSkillInfo } from "../types";

export function usePluginSkills() {
  return useQuery<PluginSkillInfo[]>({
    queryKey: ["plugin-skills"],
    queryFn: listPluginSkills,
    staleTime: Infinity,
  });
}

export function useAllClaudeSkills() {
  return useQuery<ClaudeSkillEntry[]>({
    queryKey: ["all-claude-skills"],
    queryFn: listAllClaudeSkills,
    staleTime: Infinity,
  });
}

export function usePluginSkillFile(skillName: string, filename: string) {
  return useQuery<string>({
    queryKey: ["plugin-skill-file", skillName, filename],
    queryFn: () => readPluginSkillFile(skillName, filename),
    enabled: !!skillName && !!filename,
    staleTime: Infinity,
  });
}
