import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import type { SummarizeTicketResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";

// An on-demand AI summary of the ticket and its reply thread, rendered under the
// inbound message. Nothing is fetched until the agent asks: a summary costs a model
// call, and most tickets are short enough to just read.
//
// Deliberately a mutation rather than a query, even though it only reads: it must
// never be served from the query cache. Each click regenerates against the thread as
// it stands now — an agent who summarizes, replies, and summarizes again has to see
// the second reply reflected, and a cached first answer would quietly describe a
// conversation that has since moved on. The server holds no summary either; this
// component's state is the only place it lives, and it dies with the page.
export default function TicketSummary({ ticketId }: { ticketId: number }) {
  // The summary on screen, held here rather than read off `summarize.data`: React
  // Query clears a mutation's data the moment the next mutate() starts, which would
  // blank the panel out for the length of a regenerate — the one moment the agent is
  // most likely to be mid-sentence. Keeping it means a regenerate swaps the text
  // only once the new summary has actually arrived.
  const [summary, setSummary] = useState<string | null>(null);

  const summarize = useMutation({
    mutationFn: async () =>
      (
        await api.post<SummarizeTicketResponse>(
          `/api/tickets/${ticketId}/summary`,
        )
      ).data,
    onSuccess: (data) => setSummary(data.summary),
  });

  return (
    <div className="space-y-3">
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={summarize.isPending}
          onClick={() => summarize.mutate()}
        >
          {summarize.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Sparkles />
          )}
          {/* Once a summary is on screen the button's job changes: it replaces the
              summary with a freshly generated one, so say so. */}
          {summary ? "Regenerate summary" : "Summarize"}
        </Button>
      </div>

      {summarize.isError && (
        <ErrorAlert
          error={summarize.error}
          fallback="Failed to summarize the ticket."
        />
      )}

      {/* The previous summary stays put while a regenerate is in flight (the button
          carries the spinner), so the panel never blanks out mid-read — and it
          survives a failed regenerate too, alongside the error. */}
      {summary && (
        <div className="bg-muted/50 space-y-1 rounded-md p-3">
          <h3 className="text-muted-foreground text-xs font-medium">Summary</h3>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
}
