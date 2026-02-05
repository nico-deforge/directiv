import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { toast } from "sonner";
import "./index.css";
import App from "./App.tsx";

function isLinearRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  // Check error message
  const message =
    (error as { message?: string }).message ??
    (error as { toString?: () => string }).toString?.() ??
    "";
  if (message.toLowerCase().includes("rate limit")) return true;

  // Check raw response format
  if ("errors" in error) {
    const errors = (error as { errors?: unknown[] }).errors;
    if (Array.isArray(errors)) {
      return errors.some((e) => {
        if (!e || typeof e !== "object") return false;
        const ext = (e as { extensions?: { code?: string } }).extensions;
        const msg = (e as { message?: string }).message ?? "";
        return (
          ext?.code === "RATELIMITED" || msg.toLowerCase().includes("rate limit")
        );
      });
    }
  }

  // Check if SDK wraps the response in a different structure
  if ("response" in error) {
    const response = (error as { response?: unknown }).response;
    return isLinearRateLimitError(response);
  }

  return false;
}

let lastRateLimitToast = 0;

function handleError(error: unknown) {
  if (isLinearRateLimitError(error)) {
    // Debounce rate limit toasts (show max once per 10 seconds)
    const now = Date.now();
    if (now - lastRateLimitToast > 10_000) {
      lastRateLimitToast = now;
      toast.error("Linear rate limit exceeded", {
        description: "Please wait a few minutes before retrying.",
        duration: 10_000,
      });
    }
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleError,
  }),
  mutationCache: new MutationCache({
    onError: handleError,
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on rate limit
        if (isLinearRateLimitError(error)) return false;
        return failureCount < 1;
      },
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
