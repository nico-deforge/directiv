import { LinearClient } from "@linear/sdk";
import { create } from "zustand";
import {
  linearGetValidToken,
  linearOAuthStart,
  linearOAuthDisconnect,
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

const DISCONNECTED_STATE = {
  linearAccessToken: null,
  linearStatus: AUTH_PROVIDER_STATUS.DISCONNECTED,
  linearError: null,
} as const;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Cached client -- self-manages based on current token
let cachedClient: LinearClient | null = null;
let cachedToken: string | null = null;

export function getLinearClient(): LinearClient | null {
  const token = useAuthStore.getState().linearAccessToken;
  if (!token) {
    cachedClient = null;
    cachedToken = null;
    return null;
  }
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
        set(DISCONNECTED_STATE);
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
    set(DISCONNECTED_STATE);
  },

  refreshLinearTokenIfNeeded: async () => {
    const { linearAccessToken } = get();
    if (!linearAccessToken) return;

    try {
      const token = await linearGetValidToken();
      if (token && token !== linearAccessToken) {
        set({ linearAccessToken: token });
      } else if (!token) {
        set(DISCONNECTED_STATE);
      }
    } catch {
      set(DISCONNECTED_STATE);
    }
  },
}));
