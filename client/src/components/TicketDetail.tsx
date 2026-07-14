import { useMemo } from "react";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// A single labelled field in the metadata grid.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// The read-only summary of an inbound ticket — subject, who it's from, the message
// body, and the created/updated timestamps. Purely presentational: it renders the
// already-loaded ticket; the editable controls and reply thread live in their own
// components.
export default function TicketDetail({ ticket }: { ticket: TicketDetailData }) {
  // When the inbound email carried an HTML part, render it (sanitized) so the
  // original formatting survives; otherwise fall back to the plain-text body.
  // Sanitizing is cheap but memoized so it doesn't re-run on unrelated re-renders.
  const cleanHtml = useMemo(
    () => (ticket.bodyHtml ? sanitizeHtml(ticket.bodyHtml) : null),
    [ticket.bodyHtml],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{ticket.subject}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Who the inbound message is from — name (falling back to email) plus the
            email address when a name is present. */}
        <p className="text-muted-foreground text-xs">
          From{" "}
          <span className="text-foreground">
            {ticket.requesterName ?? ticket.requesterEmail}
          </span>
          {ticket.requesterName && (
            <>
              {" "}
              <span>{ticket.requesterEmail}</span>
            </>
          )}
        </p>

        <div className="space-y-1">
          <h2 className="text-muted-foreground text-xs font-medium">Message</h2>
          {cleanHtml !== null ? (
            // Sanitized via DOMPurify above — safe to inject as markup.
            <div
              className="text-sm [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: cleanHtml }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{ticket.body}</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <Field label="Created">
            {new Date(ticket.createdAt).toLocaleString()}
          </Field>
          <Field label="Updated">
            {new Date(ticket.updatedAt).toLocaleString()}
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}
