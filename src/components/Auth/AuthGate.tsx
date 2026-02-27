import { useState } from "react";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  KanbanSquare,
  Github,
  Copy,
  Check,
} from "lucide-react";
import {
  useAuthStore,
  AUTH_PROVIDER_STATUS,
  type AuthProviderStatus,
} from "../../stores/authStore";

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1.5 rounded bg-[var(--bg-elevated)] px-2 py-1 transition-colors hover:bg-[var(--bg-elevated)]/80"
    >
      <code className="font-mono text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </code>
      {copied ? (
        <Check className="size-3 text-[var(--accent-green)]" />
      ) : (
        <Copy className="size-3 text-[var(--text-muted)]" />
      )}
    </button>
  );
}

function ProviderRow({
  name,
  icon,
  status,
  error,
  children,
}: {
  name: string;
  icon: React.ReactNode;
  status: AuthProviderStatus;
  error: string | null;
  children: React.ReactNode;
}) {
  const isConnected = status === AUTH_PROVIDER_STATUS.CONNECTED;
  const hasError = !!error;

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">
              {name}
            </span>
            {isConnected && (
              <CheckCircle2 className="size-4 text-[var(--accent-green)]" />
            )}
          </div>
        </div>
        {isConnected ? (
          <span className="text-xs text-[var(--accent-green)]">Connected</span>
        ) : (
          children
        )}
      </div>
      {hasError && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/10 p-2.5">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--accent-red)]" />
          <p className="text-xs text-[var(--accent-red)]">{error}</p>
        </div>
      )}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const linearError = useAuthStore((s) => s.linearError);
  const startLinearOAuth = useAuthStore((s) => s.startLinearOAuth);

  const githubStatus = useAuthStore((s) => s.githubStatus);
  const githubError = useAuthStore((s) => s.githubError);
  const githubUserCode = useAuthStore((s) => s.githubUserCode);
  const startGitHubOAuth = useAuthStore((s) => s.startGitHubOAuth);

  const bothConnected =
    linearStatus === AUTH_PROVIDER_STATUS.CONNECTED &&
    githubStatus === AUTH_PROVIDER_STATUS.CONNECTED;

  if (bothConnected) {
    return children;
  }

  const isLinearConnecting = linearStatus === AUTH_PROVIDER_STATUS.CONNECTING;
  const isGitHubConnecting = githubStatus === AUTH_PROVIDER_STATUS.CONNECTING;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Connect your accounts
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Directiv needs access to Linear and GitHub to manage your
            development workflow.
          </p>
        </div>

        <div className="space-y-3">
          {/* Linear */}
          <ProviderRow
            name="Linear"
            icon={
              <KanbanSquare className="size-4 text-[var(--text-primary)]" />
            }
            status={linearStatus}
            error={linearError}
          >
            <button
              onClick={startLinearOAuth}
              className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
            >
              {isLinearConnecting && (
                <Loader2 className="size-3 animate-spin" />
              )}
              Connect
            </button>
          </ProviderRow>

          {/* GitHub */}
          <ProviderRow
            name="GitHub"
            icon={<Github className="size-4 text-[var(--text-primary)]" />}
            status={githubStatus}
            error={githubError}
          >
            {isGitHubConnecting && githubUserCode && (
              <CopyableCode value={githubUserCode} />
            )}
            <button
              onClick={startGitHubOAuth}
              className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
            >
              {isGitHubConnecting && (
                <Loader2 className="size-3 animate-spin" />
              )}
              Connect
            </button>
          </ProviderRow>
        </div>

        {isGitHubConnecting && githubUserCode && (
          <p className="text-center text-xs text-[var(--text-muted)]">
            Enter the code above on github.com/login/device
          </p>
        )}
      </div>
    </div>
  );
}
