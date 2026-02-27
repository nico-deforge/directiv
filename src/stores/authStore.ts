import { LinearClient } from "@linear/sdk";
import { Octokit } from "@octokit/rest";
import { create } from "zustand";
import {
  linearGetValidToken,
  linearOAuthStart,
  linearOAuthDisconnect,
  githubGetToken,
  githubOAuthStart,
  githubOAuthPoll,
  githubOAuthDisconnect,
} from "../lib/tauriOAuth";

export const AUTH_PROVIDER_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
} as const;

export type AuthProviderStatus =
  (typeof AUTH_PROVIDER_STATUS)[keyof typeof AUTH_PROVIDER_STATUS];

interface AuthState {
  // Linear
  linearAccessToken: string | null;
  linearStatus: AuthProviderStatus;
  linearError: string | null;
  initializeLinearAuth: () => Promise<void>;
  startLinearOAuth: () => Promise<void>;
  disconnectLinear: () => Promise<void>;
  refreshLinearTokenIfNeeded: () => Promise<void>;

  // GitHub
  githubAccessToken: string | null;
  githubStatus: AuthProviderStatus;
  githubError: string | null;
  githubUserCode: string | null;
  initializeGitHubAuth: () => Promise<void>;
  startGitHubOAuth: () => Promise<void>;
  disconnectGitHub: (error?: string) => Promise<void>;
}

const LINEAR_DISCONNECTED = {
  linearAccessToken: null,
  linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  linearError: null,
} as const;

const GITHUB_DISCONNECTED = {
  githubAccessToken: null,
  githubStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  githubError: null,
  githubUserCode: null,
} as const;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Cached Linear client
let cachedLinearClient: LinearClient | null = null;
let cachedLinearToken: string | null = null;

export function getLinearClient(): LinearClient | null {
  const token = useAuthStore.getState().linearAccessToken;
  if (!token) {
    cachedLinearClient = null;
    cachedLinearToken = null;
    return null;
  }
  if (token !== cachedLinearToken) {
    cachedLinearClient = new LinearClient({ accessToken: token });
    cachedLinearToken = token;
  }
  return cachedLinearClient;
}

// Cached Octokit client
let cachedOctokit: Octokit | null = null;
let cachedGithubToken: string | null = null;

export function getOctokitClient(): Octokit | null {
  const token = useAuthStore.getState().githubAccessToken;
  if (!token) {
    cachedOctokit = null;
    cachedGithubToken = null;
    return null;
  }
  if (token !== cachedGithubToken) {
    cachedOctokit = new Octokit({ auth: token });
    cachedGithubToken = token;
  }
  return cachedOctokit;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // --- Linear ---
  linearAccessToken: null,
  linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  linearError: null,

  initializeLinearAuth: async () => {
    try {
      const token = await linearGetValidToken();
      if (token) {
        set({
          linearAccessToken: token,
          linearStatus: AUTH_PROVIDER_STATUS.CONNECTED,
          linearError: null,
        });
      } else {
        set(LINEAR_DISCONNECTED);
      }
    } catch (err) {
      set({
        linearAccessToken: null,
        linearStatus: AUTH_PROVIDER_STATUS.ERROR,
        linearError: toErrorMessage(err),
      });
    }
  },

  startLinearOAuth: async () => {
    set({
      linearStatus: AUTH_PROVIDER_STATUS.CONNECTING,
      linearError: null,
    });
    try {
      const token = await linearOAuthStart();
      set({
        linearAccessToken: token,
        linearStatus: AUTH_PROVIDER_STATUS.CONNECTED,
        linearError: null,
      });
    } catch (err) {
      set({
        linearStatus: AUTH_PROVIDER_STATUS.ERROR,
        linearError: toErrorMessage(err),
      });
    }
  },

  disconnectLinear: async () => {
    try {
      await linearOAuthDisconnect();
    } catch {
      // Best effort
    }
    set(LINEAR_DISCONNECTED);
  },

  refreshLinearTokenIfNeeded: async () => {
    const { linearAccessToken } = get();
    if (!linearAccessToken) return;

    try {
      const token = await linearGetValidToken();
      if (token && token !== linearAccessToken) {
        set({ linearAccessToken: token });
      } else if (!token) {
        set(LINEAR_DISCONNECTED);
      }
    } catch {
      set(LINEAR_DISCONNECTED);
    }
  },

  // --- GitHub ---
  githubAccessToken: null,
  githubStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  githubError: null,
  githubUserCode: null,

  initializeGitHubAuth: async () => {
    try {
      const token = await githubGetToken();
      if (!token) {
        set(GITHUB_DISCONNECTED);
        return;
      }
      // Validate the token actually works (catches org-blocked, revoked, etc.)
      const octokit = new Octokit({ auth: token });
      await octokit.rest.users.getAuthenticated();
      set({
        githubAccessToken: token,
        githubStatus: AUTH_PROVIDER_STATUS.CONNECTED,
        githubError: null,
        githubUserCode: null,
      });
    } catch {
      // Token exists but doesn't work — clear it and show error
      try {
        await githubOAuthDisconnect();
      } catch {
        // Best effort keyring cleanup
      }
      set({
        ...GITHUB_DISCONNECTED,
        githubError:
          "GitHub access was revoked or blocked by your organization. Please reconnect.",
      });
    }
  },

  startGitHubOAuth: async () => {
    set({
      githubStatus: AUTH_PROVIDER_STATUS.CONNECTING,
      githubError: null,
      githubUserCode: null,
    });
    try {
      const deviceResp = await githubOAuthStart();
      set({ githubUserCode: deviceResp.user_code });

      const token = await githubOAuthPoll(
        deviceResp.device_code,
        deviceResp.interval,
        deviceResp.expires_in,
      );
      set({
        githubAccessToken: token,
        githubStatus: AUTH_PROVIDER_STATUS.CONNECTED,
        githubError: null,
        githubUserCode: null,
      });
    } catch (err) {
      set({
        githubStatus: AUTH_PROVIDER_STATUS.ERROR,
        githubError: toErrorMessage(err),
        githubUserCode: null,
      });
    }
  },

  disconnectGitHub: async (error?: string) => {
    try {
      await githubOAuthDisconnect();
    } catch {
      // Best effort
    }
    set({ ...GITHUB_DISCONNECTED, githubError: error ?? null });
  },
}));
