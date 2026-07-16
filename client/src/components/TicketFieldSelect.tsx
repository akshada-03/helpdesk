import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  TicketDetail,
  UpdateTicketInput,
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

// A single-field editor for a ticket enum (status or category). Renders a select
// of the given options and PATCHes just the chosen field when it changes, then
// refreshes the ticket detail and the list so both stay in sync. `buildPatch`
// turns the selected option value into the partial request body, keeping this
// component agnostic of which field it edits.
export default function TicketFieldSelect({
  ticketId,
  value,
  options,
  ariaLabel,
  buildPatch,
  placeholder,
}: {
  ticketId: number;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  buildPatch: (value: string) => UpdateTicketInput;
  placeholder?: string;
}) {
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async (next: string) =>
      (await api.patch<TicketDetail>(`/api/tickets/${ticketId}`, buildPatch(next)))
        .data,
    onSuccess: (updated) => {
      queryClient.setQueryData(["ticket", ticketId], updated);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={(next) => update.mutate(next)}
        disabled={update.isPending}
      >
        <SelectTrigger className="w-full" aria-label={ariaLabel}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {update.isError && (
        <ErrorAlert error={update.error} fallback="Failed to update ticket." />
      )}
    </div>
  );
}
