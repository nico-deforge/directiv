import { Loader2, AlertCircle } from "lucide-react";
import {
  useAuthStore,
  AUTH_PROVIDER_STATUS,
  type AuthProviderStatus,
} from "../../stores/authStore";
import directivLogo from "../../assets/directiv-logo.png";

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
  return (
    <>
      <LinearLogo className="size-4" />
      Connect with Linear
    </>
  );
}

function LinearLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className}>
      <path
        d="M1.22 61.54a48.58 48.58 0 0 1-.23-2.23l40.33 40.33a50.4 50.4 0 0 1-2.24-.23L1.23 61.54Zm-1-9.51a49.73 49.73 0 0 1 .53-4.48l52.3 52.3a49.67 49.67 0 0 1-4.48.54L.22 52.03Zm1.63-10.53a50.14 50.14 0 0 1 1.66-5.34l63.37 63.37a50.1 50.1 0 0 1-5.34 1.65L1.85 41.5ZM6.23 30.7A50.25 50.25 0 0 1 9.32 25l65.7 65.7a50.3 50.3 0 0 1-5.71 3.08L6.22 30.7Zm8.2-9.72a50.25 50.25 0 0 1 49.1-13.23l.49.13a3.2 3.2 0 0 1 2.28 2.28c5.18 19.76-1.07 41.2-16.73 56.85-15.64 15.66-37.08 21.9-56.84 16.72a3.2 3.2 0 0 1-2.28-2.28l-.13-.5a50.25 50.25 0 0 1 13.23-49.09l.88-.87Zm61.07-6.9a50.27 50.27 0 0 1 5.73 3.08L18.15 80.22a50.24 50.24 0 0 1-3.08-5.72l60.43-60.42Zm9.35 8.77a50.08 50.08 0 0 1 1.66 5.34l-45.5 45.5a50.12 50.12 0 0 1-5.34-1.66l49.18-49.18Zm4.38 11.66a49.66 49.66 0 0 1 .53 4.48L41.4 87.35a49.68 49.68 0 0 1-4.48-.53l52.3-52.3Zm1 9.51c.1.74.17 1.49.23 2.24L52.6 84.12c-.75-.06-1.5-.13-2.24-.23l39.87-39.87Zm.48 6.3c.15 3.2.08 6.4-.2 9.56L80.95 69.4a96.35 96.35 0 0 0 9.56-.2l.2-.2Zm-1.6 13.77a49.9 49.9 0 0 1-26.72 26.72L91.1 63.1Z"
        fill="currentColor"
      />
    </svg>
  );
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
        <img src={directivLogo} alt="Directiv" className="size-20" />

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
