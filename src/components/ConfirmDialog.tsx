import { X } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  isLoading = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-800">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {message}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
