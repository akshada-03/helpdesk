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
          className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/50 transition-all font-medium"
          disabled={summarize.isPending}
          onClick={() => summarize.mutate()}
        >
          {summarize.isPending ? (
            <Loader2 className="animate-spin size-4 text-primary" />
          ) : (
            <Sparkles className="size-4 text-primary" />
          )}
          {summary ? "Regenerate summary" : "Summarize"}
        </Button>
      </div>

      {summarize.isError && (
        <ErrorAlert
          error={summarize.error}
          fallback="Failed to summarize the ticket."
        />
      )}

      {summary && (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-muted/20 p-4 shadow-xs">
          <div className="flex items-center gap-2 pb-2 text-primary font-semibold text-xs uppercase tracking-wider u-label">
            <Sparkles className="size-4" />
            <span>AI Executive Summary</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{summary}</p>
        </div>
      )}
    </div>
  );
}
