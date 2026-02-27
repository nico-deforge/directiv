import {
  CheckCircle2,
  KanbanSquare,
  Loader2,
  LogOut,
  Plug,
} from "lucide-react";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";

export function IntegrationsSection() {
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const disconnectLinear = useAuthStore((s) => s.disconnectLinear);

  const githubStatus = useAuthStore((s) => s.githubStatus);
  const githubUserCode = useAuthStore((s) => s.githubUserCode);
  const startGitHubOAuth = useAuthStore((s) => s.startGitHubOAuth);
  const disconnectGitHub = useAuthStore((s) => s.disconnectGitHub);

  const queryClient = useQueryClient();

  async function handleDisconnectLinear() {
    await disconnectLinear();
    queryClient.invalidateQueries({ queryKey: ["linear"] });
  }

  async function handleDisconnectGitHub() {
    await disconnectGitHub();
    queryClient.invalidateQueries({ queryKey: ["github"] });
  }

  const isLinearConnected = linearStatus === AUTH_PROVIDER_STATUS.CONNECTED;
  const isGitHubConnected = githubStatus === AUTH_PROVIDER_STATUS.CONNECTED;
  const isGitHubConnecting = githubStatus === AUTH_PROVIDER_STATUS.CONNECTING;

  function renderGitHubStatus(): React.ReactNode {
    if (isGitHubConnected) {
      return (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3 text-[var(--accent-green)]" />
          <span className="text-[var(--accent-green)]">
            Connected via OAuth
          </span>
        </span>
      );
    }
    if (isGitHubConnecting && githubUserCode) {
      return (
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" />
          Enter code{" "}
          <code className="rounded bg-[var(--bg-elevated)] px-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {githubUserCode}
          </code>{" "}
          on github.com
        </span>
      );
    }
    return "Not connected";
  }

  function renderGitHubAction(): React.ReactNode {
    if (isGitHubConnected) {
      return (
        <button
          onClick={handleDisconnectGitHub}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
        >
          <LogOut className="size-3" />
          Disconnect
        </button>
      );
    }
    if (!isGitHubConnecting) {
      return (
        <button
          onClick={startGitHubOAuth}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
        >
          Connect
        </button>
      );
    }
    return null;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Manage your connected services and API integrations.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Plug className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Connected Services
          </h2>
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            2
          </span>
        </div>

        <div className="space-y-2">
          {/* Linear */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
                <KanbanSquare className="size-4 text-[var(--text-primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--text-primary)]">
                  Linear
                </span>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {isLinearConnected ? (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3 text-[var(--accent-green)]" />
                      <span className="text-[var(--accent-green)]">
                        Connected via OAuth
                      </span>
                    </span>
                  ) : (
                    "Not connected"
                  )}
                </p>
              </div>
              {isLinearConnected && (
                <button
                  onClick={handleDisconnectLinear}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
                >
                  <LogOut className="size-3" />
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* GitHub */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <path
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    className="text-[var(--text-primary)]"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--text-primary)]">
                  GitHub
                </span>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {renderGitHubStatus()}
                </p>
              </div>
              {renderGitHubAction()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
