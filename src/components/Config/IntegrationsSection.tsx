import { CheckCircle2, LogOut, Plug } from "lucide-react";
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

  const isLinearConnected = linearStatus === AUTH_PROVIDER_STATUS.CONNECTED;

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
                <svg
                  viewBox="0 0 100 100"
                  className="size-4"
                  fill="currentColor"
                >
                  <path
                    d="M1.22541 61.5228c-.97022 2.1399-.4832 4.6484 1.17538 6.3069L28.6818 95.5765c1.6586 1.6586 4.167 2.1456 6.307 1.1754l7.0528-3.1981c-5.6498-4.3648-10.5174-9.637-14.3606-15.5601l-4.9557 2.2489c-1.2851.5831-2.7885.2297-3.6373-.8191L6.47997 66.815c-1.0486-1.0486-1.40213-2.3522-.8191-3.6373l2.2489-4.9557C2.00084 54.3799-1.8704 49.4629-4.3648 43.7343l-3.1981 7.0528z"
                    transform="translate(4, 0)"
                    className="text-[var(--text-primary)]"
                  />
                  <path
                    d="M19.3553 73.8554c4.1419 5.4237 9.2563 10.0948 15.0662 13.8567l60.1756-60.1756c-3.7619-5.8099-8.433-10.9243-13.8567-15.0662L19.3553 73.8554z"
                    transform="translate(4, 0)"
                    className="text-[var(--text-primary)]"
                  />
                  <path
                    d="M94.5765 31.6818 68.8233 5.92856c-1.6586-1.6586-4.167-2.14565-6.307-1.17539l-7.0528 3.19812c5.6498 4.36478 10.5174 9.63698 14.3606 15.56011l4.9557-2.2489c1.2851-.5832 2.7885-.2297 3.6373.8191l12.6083 12.6083c1.0486 1.0486 1.4022 2.3522.8191 3.6373l-2.2489 4.9557c5.9231 3.8432 11.1953 8.7108 15.5601 14.3606l3.1981-7.0528c.9703-2.1399.4833-4.6484-1.1754-6.307z"
                    transform="translate(4, 0)"
                    className="text-[var(--text-primary)]"
                  />
                </svg>
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
                  onClick={handleDisconnect}
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
                  Using personal access token from .env
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
