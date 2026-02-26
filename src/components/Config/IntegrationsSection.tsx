import { CheckCircle2, LogOut } from "lucide-react";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";

export function IntegrationsSection() {
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const disconnectLinear = useAuthStore((s) => s.disconnectLinear);
  const queryClient = useQueryClient();

  async function handleDisconnect() {
    await disconnectLinear();
    queryClient.invalidateQueries({ queryKey: ["linear"] });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Integrations
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Manage your connected services.
        </p>
      </div>

      {/* Linear */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                  fill="currentColor"
                  className="text-[var(--text-primary)]"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Linear
              </p>
              <div className="flex items-center gap-1.5">
                {linearStatus === AUTH_PROVIDER_STATUS.CONNECTED ? (
                  <>
                    <CheckCircle2 className="size-3 text-[var(--accent-green)]" />
                    <span className="text-xs text-[var(--accent-green)]">
                      Connected
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    Not connected
                  </span>
                )}
              </div>
            </div>
          </div>
          {linearStatus === AUTH_PROVIDER_STATUS.CONNECTED && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
            >
              <LogOut className="size-3" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* GitHub (read-only info) */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                className="text-[var(--text-primary)]"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              GitHub
            </p>
            <span className="text-xs text-[var(--text-muted)]">
              Using personal access token from .env
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
