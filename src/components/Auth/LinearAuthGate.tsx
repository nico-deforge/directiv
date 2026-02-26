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
        <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--bg-elevated)]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-8 text-[var(--accent-blue)]"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

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
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-blue)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {getButtonLabel(linearStatus)}
        </button>
      </div>
    </div>
  );
}
