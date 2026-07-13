import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Role } from "core/constants/role.ts";
import type { TicketStatus, TicketCategory } from "core/constants/ticket.ts";
import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import Navbar from "@/components/Navbar";
import AssigneeSelect from "@/components/AssigneeSelect";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Badge styling per status (mirrors TicketsTable).
const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> =
  {
    open: "default",
    resolved: "secondary",
    closed: "outline",
  };

// "open" → "Open".
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "general_question" → "General question"; null → "—".
function formatCategory(category: TicketCategory | null): string {
  if (!category) return "—";
  return capitalize(category.replace(/_/g, " "));
}

// A single labelled field in the metadata grid.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// Ticket detail page, reached by clicking a subject in the ticket list. Owns its
// own query keyed on the `:id` route param.
export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  // Only admins may (re)assign tickets; agents see the assignee read-only.
  const { data: session } = useSession();
  const isAdmin = session?.user.role === Role.admin;

  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () =>
      (await api.get<TicketDetailData>(`/api/tickets/${id}`)).data,
  });

  let content;
  if (ticket.isPending) {
    content = (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (ticket.isError) {
    content = (
      <ErrorAlert error={ticket.error} fallback="Failed to load ticket." />
    );
  } else {
    const t = ticket.data;
    content = (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t.subject}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Status">
              <Badge variant={statusVariant[t.status]}>{t.status}</Badge>
            </Field>
            <Field label="Category">{formatCategory(t.category)}</Field>
            <Field label="Created">
              {new Date(t.createdAt).toLocaleString()}
            </Field>
            <Field label="Updated">
              {new Date(t.updatedAt).toLocaleString()}
            </Field>
          </dl>

          <div className="space-y-1">
            <h2 className="text-muted-foreground text-xs font-medium">
              Assigned to
            </h2>
            {isAdmin ? (
              <AssigneeSelect ticketId={t.id} assignee={t.assignee} />
            ) : t.assignee ? (
              <p className="text-sm">{t.assignee.name}</p>
            ) : (
              <p className="text-muted-foreground text-sm">Unassigned</p>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-muted-foreground text-xs font-medium">
              Message
            </h2>
            {/* Who the inbound message is from — name (falling back to email)
                plus the email address when a name is present. */}
            <p className="text-muted-foreground text-xs">
              From{" "}
              <span className="text-foreground">
                {t.requesterName ?? t.requesterEmail}
              </span>
              {t.requesterName && (
                <>
                  {" "}
                  <span>{t.requesterEmail}</span>
                </>
              )}
            </p>
            <p className="text-sm whitespace-pre-wrap">{t.body}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/tickets"
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to tickets
        </Link>

        {content}
      </main>
    </div>
  );
}
