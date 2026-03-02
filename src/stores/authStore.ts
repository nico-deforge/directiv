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

// Module-level guard: prevents StrictMode double-fire from triggering
// concurrent duplicate init calls (two component instances = two refs,
// so useRef won't help — must be module-scoped).
const _initInFlight = new Set<string>();

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
  linearOrgId: string | null;
  linearOrgName: string | null;
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
  linearOrgId: null,
  linearOrgName: null,
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

async function fetchLinearOrg(
  token: string,
): Promise<{ id: string; name: string }> {
  const client = new LinearClient({ accessToken: token });
  const me = await client.viewer;
  const org = await me.organization;
  return { id: org.id, name: org.name };
}

function createCachedClientFactory<T>(
  getToken: () => string | null,
  create: (token: string) => T,
): () => T | null {
  let cached: T | null = null;
  let cachedToken: string | null = null;

  return function getCachedClient(): T | null {
    const token = getToken();
    if (!token) {
      cached = null;
      cachedToken = null;
      return null;
    }
    if (token !== cachedToken) {
      cached = create(token);
      cachedToken = token;
    }
    return cached;
  };
}

export const getLinearClient = createCachedClientFactory(
  () => useAuthStore.getState().linearAccessToken,
  (token) => new LinearClient({ accessToken: token }),
);

export const getOctokitClient = createCachedClientFactory(
  () => useAuthStore.getState().githubAccessToken,
  (token) => new Octokit({ auth: token }),
);

export const useAuthStore = create<AuthState>((set, get) => ({
  // --- Linear ---
  linearAccessToken: null,
  linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  linearError: null,
  linearOrgId: null,
  linearOrgName: null,

  initializeLinearAuth: async () => {
    if (_initInFlight.has("linear")) return;
    _initInFlight.add("linear");
    try {
      const token = await linearGetValidToken();
      if (token) {
        const org = await fetchLinearOrg(token);
        set({
          linearAccessToken: token,
          linearStatus: AUTH_PROVIDER_STATUS.CONNECTED,
          linearError: null,
          linearOrgId: org.id,
          linearOrgName: org.name,
        });
      } else {
        set(LINEAR_DISCONNECTED);
      }
    } catch (err) {
      set({
        linearAccessToken: null,
        linearOrgId: null,
        linearOrgName: null,
        linearStatus: AUTH_PROVIDER_STATUS.ERROR,
        linearError: toErrorMessage(err),
      });
    } finally {
      _initInFlight.delete("linear");
    }
  },

  startLinearOAuth: async () => {
    set({
      linearStatus: AUTH_PROVIDER_STATUS.CONNECTING,
      linearError: null,
    });
    try {
      const token = await linearOAuthStart();
      // Store token immediately so it's not lost if org fetch fails
      set({
        linearAccessToken: token,
        linearStatus: AUTH_PROVIDER_STATUS.CONNECTED,
        linearError: null,
      });
      const org = await fetchLinearOrg(token);
      set({ linearOrgId: org.id, linearOrgName: org.name });
    } catch (err) {
      // If token was already stored, keep CONNECTED status
      if (get().linearAccessToken) return;
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
    if (_initInFlight.has("github")) return;
    _initInFlight.add("github");
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
    } finally {
      _initInFlight.delete("github");
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
