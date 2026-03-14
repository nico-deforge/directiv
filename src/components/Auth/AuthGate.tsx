import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  KanbanSquare,
  Github,
  RefreshCw,
  Terminal,
  GitBranch,
} from "lucide-react";
import {
  useAuthStore,
  AUTH_PROVIDER_STATUS,
  type AuthProviderStatus,
} from "../../stores/authStore";
import { WtSetupInstructions } from "./WtSetupInstructions";

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

function GitHubSetupInstructions() {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
        <Terminal className="size-3" />
        Setup in your terminal
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-muted)]/20 text-[9px] font-medium text-[var(--text-muted)]">
            1
          </span>
          <code className="text-xs text-[var(--text-secondary)]">
            brew install gh
          </code>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-muted)]/20 text-[9px] font-medium text-[var(--text-muted)]">
            2
          </span>
          <code className="text-xs text-[var(--text-secondary)]">
            gh auth login
          </code>
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const linearError = useAuthStore((s) => s.linearError);
  const startLinearOAuth = useAuthStore((s) => s.startLinearOAuth);

  const githubStatus = useAuthStore((s) => s.githubStatus);
  const githubError = useAuthStore((s) => s.githubError);
  const recheckGitHubAuth = useAuthStore((s) => s.recheckGitHubAuth);

  const wtAvailable = useAuthStore((s) => s.wtAvailable);
  const wtError = useAuthStore((s) => s.wtError);
  const recheckWt = useAuthStore((s) => s.recheckWt);

  const allReady =
    linearStatus === AUTH_PROVIDER_STATUS.CONNECTED &&
    githubStatus === AUTH_PROVIDER_STATUS.CONNECTED &&
    wtAvailable === true;

  if (allReady) {
    return children;
  }

  // Still initializing wt (null = not yet checked)
  const isWtChecking = wtAvailable === null;
  const isWtMissing = wtAvailable === false;

  const isLinearConnecting = linearStatus === AUTH_PROVIDER_STATUS.CONNECTING;
  const isGitHubConnecting = githubStatus === AUTH_PROVIDER_STATUS.CONNECTING;
  const isGitHubDisconnected =
    githubStatus === AUTH_PROVIDER_STATUS.DISCONNECTED ||
    githubStatus === AUTH_PROVIDER_STATUS.ERROR;

  const wtStatus: AuthProviderStatus = isWtChecking
    ? AUTH_PROVIDER_STATUS.CONNECTING
    : isWtMissing
      ? AUTH_PROVIDER_STATUS.ERROR
      : AUTH_PROVIDER_STATUS.CONNECTED;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Connect your accounts
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Directiv needs access to Linear, GitHub, and Worktrunk to manage
            your development workflow.
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
              disabled={isLinearConnecting}
              className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isLinearConnecting && (
                <Loader2 className="size-3 animate-spin" />
              )}
              Connect
            </button>
          </ProviderRow>

          {/* GitHub — via gh CLI */}
          <div>
            <ProviderRow
              name="GitHub"
              icon={<Github className="size-4 text-[var(--text-primary)]" />}
              status={githubStatus}
              error={githubError}
            >
              <button
                onClick={recheckGitHubAuth}
                disabled={isGitHubConnecting}
                className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isGitHubConnecting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Check again
              </button>
            </ProviderRow>
            {isGitHubDisconnected && <GitHubSetupInstructions />}
          </div>

          {/* wt (Worktrunk CLI) */}
          <div>
            <ProviderRow
              name="Worktrunk (wt)"
              icon={<GitBranch className="size-4 text-[var(--text-primary)]" />}
              status={wtStatus}
              error={isWtMissing ? (wtError ?? "wt CLI not found") : null}
            >
              <button
                onClick={recheckWt}
                disabled={isWtChecking}
                className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isWtChecking ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Check again
              </button>
            </ProviderRow>
            {isWtMissing && <WtSetupInstructions />}
          </div>
        </div>
      </div>
    </div>
  );
}
