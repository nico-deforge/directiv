import { Loader2, AlertCircle } from "lucide-react";
import {
  useAuthStore,
  AUTH_PROVIDER_STATUS,
  type AuthProviderStatus,
} from "../../stores/authStore";

function getButtonLabel(status: AuthProviderStatus): React.ReactNode {
  if (status === AUTH_PROVIDER_STATUS.CONNECTING) {
    return (
      <>
        <Loader2 className="size-4 animate-spin" />
        Waiting for authorization...
      </>
    );
  }
  if (status === AUTH_PROVIDER_STATUS.ERROR) {
    return "Try again";
  }
  return "Connect with Linear";
}

export function LinearAuthGate({ children }: { children: React.ReactNode }) {
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const linearError = useAuthStore((s) => s.linearError);
  const startLinearOAuth = useAuthStore((s) => s.startLinearOAuth);

  if (linearStatus === AUTH_PROVIDER_STATUS.CONNECTED) {
    return children;
  }

  const isConnecting = linearStatus === AUTH_PROVIDER_STATUS.CONNECTING;
  const hasError = linearStatus === AUTH_PROVIDER_STATUS.ERROR && !!linearError;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <svg
          viewBox="0 0 100 100"
          fill="none"
          className="size-20 text-[var(--text-primary)]"
        >
          {/* Hexagon */}
          <path
            d="M50 3 L93 27 L93 73 L50 97 L7 73 L7 27 Z"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            strokeLinejoin="round"
          />
          {/* D letter */}
          <path
            d="M32 32 L32 68 L50 68 C63 68 70 59 70 50 C70 41 63 32 50 32 Z"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Arrow cutting through */}
          <path
            d="M42 62 L68 28"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M58 26 L70 26 L70 38"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Connect to Linear
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Directiv needs access to your Linear workspace to manage tasks and
            track progress.
          </p>
        </div>

        {hasError && (
          <div className="flex w-full items-start gap-2 rounded-lg border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/10 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-red)]" />
            <p className="text-left text-xs text-[var(--accent-red)]">
              {linearError}
            </p>
          </div>
        )}

        <button
          onClick={startLinearOAuth}
          disabled={isConnecting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {getButtonLabel(linearStatus)}
        </button>
      </div>
    </div>
  );
}
