import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AgentListResponse,
  AgentListItem,
} from "core/schemas/users.ts";
import type {
  TicketAssignee,
  TicketDetail,
} from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select items can't hold an empty-string value, so this sentinel stands in
// for "no agent" and maps back to `assigneeId: null` when saving.
const UNASSIGNED = "unassigned";

// Assignee picker for the ticket detail page. Loads the assignable agents and
// PATCHes the ticket when the selection changes, then refreshes the ticket (and
// the list, so its Assignee column stays in sync). Optimistic-free: it waits for
// the server and re-reads, keeping the source of truth on the backend.
export default function AssigneeSelect({
  ticketId,
  assignee,
}: {
  ticketId: number;
  assignee: TicketAssignee | null;
}) {
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: async () =>
      (await api.get<AgentListResponse>("/api/agents")).data.agents,
  });

  const assign = useMutation({
    mutationFn: async (assigneeId: string | null) =>
      (
        await api.patch<TicketDetail>(`/api/tickets/${ticketId}`, {
          assigneeId,
        })
      ).data,
    onSuccess: (updated) => {
      // Seed the detail cache with the fresh ticket and invalidate the list so
      // both reflect the new assignment without a manual refetch race.
      queryClient.setQueryData(["ticket", ticketId], updated);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <div className="space-y-2">
      <Select
        value={assignee?.id ?? UNASSIGNED}
        onValueChange={(value) =>
          assign.mutate(value === UNASSIGNED ? null : value)
        }
        disabled={agents.isPending || assign.isPending}
      >
        <SelectTrigger className="w-full" aria-label="Assign to agent">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {agents.data?.map((agent: AgentListItem) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {agents.isError && (
        <ErrorAlert error={agents.error} fallback="Failed to load agents." />
      )}
      {assign.isError && (
        <ErrorAlert error={assign.error} fallback="Failed to update assignee." />
      )}
    </div>
  );
}
