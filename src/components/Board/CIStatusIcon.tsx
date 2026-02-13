import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { CIStatus } from "../../types";

export function CIStatusIcon({
  status,
  url,
}: {
  status: CIStatus;
  url: string | null;
}) {
  if (!status) return null;

  let icon: React.ReactNode;
  let tooltip: string;

  switch (status) {
    case "SUCCESS":
      icon = <CircleCheck className="size-3.5 text-[var(--accent-green)]" />;
      tooltip = "CI passed";
      break;
    case "FAILURE":
      icon = <CircleX className="size-3.5 text-[var(--accent-red)]" />;
      tooltip = "CI failed";
      break;
    case "ERROR":
      icon = <CircleX className="size-3.5 text-[var(--accent-red)]" />;
      tooltip = "CI error";
      break;
    case "PENDING":
    case "EXPECTED":
      icon = (
        <Loader2 className="size-3.5 animate-spin text-[var(--accent-amber)]" />
      );
      tooltip = "CI running";
      break;
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={tooltip}
        className="shrink-0 hover:opacity-80"
      >
        {icon}
      </a>
    );
  }

  return (
    <span title={tooltip} className="shrink-0">
      {icon}
    </span>
  );
}
