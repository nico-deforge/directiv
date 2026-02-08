import { toast } from "sonner";

export function toastError(err: unknown): void {
  toast.error(err instanceof Error ? err.message : String(err));
}
