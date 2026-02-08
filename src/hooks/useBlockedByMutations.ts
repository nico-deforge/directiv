import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBlockedByRelation,
  deleteBlockedByRelation,
} from "../lib/workflows";
import type { EnrichedTask, BlockingIssue } from "../types";

interface CreateBlockedByParams {
  targetIssueId: string;
  blockerIssueId: string;
  // For optimistic update
  blockerInfo: {
    id: string;
    identifier: string;
    title: string;
    url: string;
  };
}

export function useCreateBlockedBy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetIssueId, blockerIssueId }: CreateBlockedByParams) =>
      createBlockedByRelation(targetIssueId, blockerIssueId),

    onMutate: async ({ targetIssueId, blockerInfo }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["linear"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueriesData<EnrichedTask[]>({
        queryKey: ["linear"],
      });

      // Optimistically update
      queryClient.setQueriesData<EnrichedTask[]>(
        { queryKey: ["linear"] },
        (old) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id !== targetIssueId) return task;
            const newBlocker: BlockingIssue = {
              ...blockerInfo,
              relationId: `temp-${crypto.randomUUID()}`,
            };
            return {
              ...task,
              isBlocked: true,
              blockedBy: [...task.blockedBy, newBlocker],
            };
          });
        },
      );

      return { previousData };
    },

    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to create blocking link");
    },

    onSettled: () => {
      // Refetch to get the real relationId
      queryClient.invalidateQueries({ queryKey: ["linear"] });
    },
  });
}

interface DeleteBlockedByParams {
  relationId: string;
  // For optimistic update - which task has this relation
  targetIssueId: string;
}

export function useDeleteBlockedBy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ relationId }: DeleteBlockedByParams) =>
      deleteBlockedByRelation(relationId),

    onMutate: async ({ relationId, targetIssueId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["linear"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueriesData<EnrichedTask[]>({
        queryKey: ["linear"],
      });

      // Optimistically update
      queryClient.setQueriesData<EnrichedTask[]>(
        { queryKey: ["linear"] },
        (old) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id !== targetIssueId) return task;
            const newBlockedBy = task.blockedBy.filter(
              (b) => b.relationId !== relationId,
            );
            return {
              ...task,
              isBlocked: newBlockedBy.length > 0,
              blockedBy: newBlockedBy,
            };
          });
        },
      );

      return { previousData };
    },

    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to remove blocking link");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["linear"] });
    },
  });
}
