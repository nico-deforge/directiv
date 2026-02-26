import { LinearClient } from "@linear/sdk";
import { create } from "zustand";
import {
  linearGetValidToken,
  linearOAuthStart,
  linearOAuthDisconnect,
  linearOAuthRefresh,
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
  linearAccessToken: string | null;
  linearStatus: AuthProviderStatus;
  linearError: string | null;

  initializeLinearAuth: () => Promise<void>;
  startLinearOAuth: () => Promise<void>;
  disconnectLinear: () => Promise<void>;
  refreshLinearTokenIfNeeded: () => Promise<void>;
}

// Cached client — recreated when token changes
let cachedClient: LinearClient | null = null;
let cachedToken: string | null = null;

export function getLinearClient(): LinearClient | null {
  const token = useAuthStore.getState().linearAccessToken;
  if (!token) return null;
  if (token !== cachedToken) {
    cachedClient = new LinearClient({ accessToken: token });
    cachedToken = token;
  }
  return cachedClient;
}

export const useAuthStore = create<AuthState>((set, get) => ({
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
        set({
          linearAccessToken: null,
          linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
          linearError: null,
        });
      }
    } catch (err) {
      set({
        linearAccessToken: null,
        linearStatus: AUTH_PROVIDER_STATUS.ERROR,
        linearError: err instanceof Error ? err.message : String(err),
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
        linearError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  disconnectLinear: async () => {
    try {
      await linearOAuthDisconnect();
    } catch {
      // Best effort
    }
    cachedClient = null;
    cachedToken = null;
    set({
      linearAccessToken: null,
      linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
      linearError: null,
    });
  },

  refreshLinearTokenIfNeeded: async () => {
    const { linearAccessToken } = get();
    if (!linearAccessToken) return;
    try {
      const token = await linearGetValidToken();
      if (token && token !== linearAccessToken) {
        set({ linearAccessToken: token });
      } else if (!token) {
        // Token expired and refresh failed
        cachedClient = null;
        cachedToken = null;
        set({
          linearAccessToken: null,
          linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
          linearError: null,
        });
      }
    } catch {
      // If refresh check fails, try explicit refresh
      try {
        const newToken = await linearOAuthRefresh();
        set({ linearAccessToken: newToken });
      } catch {
        cachedClient = null;
        cachedToken = null;
        set({
          linearAccessToken: null,
          linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
          linearError: null,
        });
      }
    }
  },
}));
