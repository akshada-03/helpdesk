import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Role } from "core/constants/role.ts";
import {
  ticketStatuses,
  ticketCategories,
  type TicketStatus,
  type TicketCategory,
} from "core/constants/ticket.ts";
import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import Navbar from "@/components/Navbar";
import AssigneeSelect from "@/components/AssigneeSelect";
import TicketFieldSelect from "@/components/TicketFieldSelect";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Display labels for each status/category. Explicit maps (rather than deriving
// the label from the value) so the wording is fully under our control.
const statusLabels: Record<TicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

const categoryLabels: Record<TicketCategory, string> = {
  general_question: "General Question",
  technical_question: "Technical Question",
  refund_request: "Refund Request",
};

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
        <CardContent>
          {/* Two equal columns: the inbound message on the left, all the
              editable attribute dropdowns (plus timestamps) on the right. */}
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left — the message */}
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

            {/* Right — editable attributes. Status and category are open to any
                agent; assignment is admin-only (read-only for agents). */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-muted-foreground text-xs font-medium">
                  Status
                </label>
                <TicketFieldSelect
                  ticketId={t.id}
                  value={t.status}
                  ariaLabel="Update status"
                  options={ticketStatuses.map((s) => ({
                    value: s,
                    label: statusLabels[s],
                  }))}
                  buildPatch={(v) => ({ status: v as TicketStatus })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-muted-foreground text-xs font-medium">
                  Category
                </label>
                <TicketFieldSelect
                  ticketId={t.id}
                  value={t.category ?? ""}
                  ariaLabel="Update category"
                  placeholder="Uncategorized"
                  options={ticketCategories.map((c) => ({
                    value: c,
                    label: categoryLabels[c],
                  }))}
                  buildPatch={(v) => ({ category: v as TicketCategory })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-muted-foreground text-xs font-medium">
                  Assigned to
                </label>
                {isAdmin ? (
                  <AssigneeSelect ticketId={t.id} assignee={t.assignee} />
                ) : t.assignee ? (
                  <p className="text-sm">{t.assignee.name}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Unassigned</p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-4">
                <Field label="Created">
                  {new Date(t.createdAt).toLocaleString()}
                </Field>
                <Field label="Updated">
                  {new Date(t.updatedAt).toLocaleString()}
                </Field>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
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
