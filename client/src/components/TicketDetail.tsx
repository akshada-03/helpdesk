import { useMemo } from "react";
import { User, Clock, Calendar } from "lucide-react";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import TicketSummary from "@/components/TicketSummary";

// A single labelled field in the metadata grid.
function Field({ label, icon: Icon, children }: { label: string; icon?: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
      <dt className="u-label flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="u-data text-xs font-medium text-foreground">{children}</dd>
    </div>
  );
}

export default function TicketDetail({ ticket }: { ticket: TicketDetailData }) {
  const cleanHtml = useMemo(
    () => (ticket.bodyHtml ? sanitizeHtml(ticket.bodyHtml) : null),
    [ticket.bodyHtml],
  );

  return (
    <Card className="border-border/80 shadow-xs overflow-hidden">
      <CardHeader className="border-b bg-muted/10 pb-5">
        <CardTitle className="text-2xl font-bold tracking-tight">{ticket.subject}</CardTitle>
        <div className="mt-2 flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-4" />
          </div>
          <div>
            From{" "}
            <span className="font-semibold text-foreground">
              {ticket.requesterName ?? ticket.requesterEmail}
            </span>
            {ticket.requesterName && (
              <>
                {" "}
                <span className="u-data text-xs text-muted-foreground">
                  {ticket.requesterEmail}
                </span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <h2 className="u-label text-xs uppercase tracking-wider font-semibold text-muted-foreground">Original Message</h2>
          <div className="rounded-xl border border-border/80 bg-card p-4.5 text-sm leading-relaxed shadow-2xs">
            {cleanHtml !== null ? (
              <div
                className="prose dark:prose-invert max-w-none text-sm [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: cleanHtml }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-foreground/90">{ticket.body}</p>
            )}
          </div>
        </div>

        <TicketSummary ticketId={ticket.id} />

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Created" icon={Calendar}>
            {new Date(ticket.createdAt).toLocaleString()}
          </Field>
          <Field label="Updated" icon={Clock}>
            {new Date(ticket.updatedAt).toLocaleString()}
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}
