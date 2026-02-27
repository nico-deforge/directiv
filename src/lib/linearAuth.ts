import type { LinearClient } from "@linear/sdk";
import { getLinearClient, useAuthStore } from "../stores/authStore";

export async function getValidLinearClient(): Promise<LinearClient | null> {
  await useAuthStore.getState().refreshLinearTokenIfNeeded();
  return getLinearClient();
}
