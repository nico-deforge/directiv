import { useQuery } from "@tanstack/react-query";
import { listBundledSkills } from "../lib/tauri";
import type { BundledSkillInfo } from "../types";

export function useBundledSkills() {
  return useQuery<BundledSkillInfo[]>({
    queryKey: ["bundled-skills"],
    queryFn: () => listBundledSkills(),
    staleTime: 60_000,
  });
}
