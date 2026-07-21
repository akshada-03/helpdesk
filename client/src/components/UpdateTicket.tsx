import { Role } from "core/constants/role.ts";
import {
  agentTicketStatuses,
  ticketCategories,
  type AgentTicketStatus,
  type TicketCategory,
} from "core/constants/ticket.ts";
import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { useSession } from "@/lib/auth-client";
import AssigneeSelect from "@/components/AssigneeSelect";
import TicketFieldSelect from "@/components/TicketFieldSelect";
import { Card, CardContent } from "@/components/ui/card";

// Display labels for each status/category. Explicit maps (rather than deriving
// the label from the value) so the wording is fully under our control. They stay
// lowercase to match how the same values render in the ticket list — these are
// field values the system holds, and the mono utility face carries them.
// Only the agent-settable statuses are offered in the editor; the `new`/
// `processing` intake states are system-managed and never shown here.
const statusLabels: Record<AgentTicketStatus, string> = {
  open: "open",
  resolved: "resolved",
  closed: "closed",
};

const categoryLabels: Record<TicketCategory, string> = {
  general_question: "general question",
  technical_question: "technical question",
  refund_request: "refund request",
};

// The editable properties for a ticket — status, category, and assignee. Status
// and category are open to any agent; assignment is admin-only (agents see the
// assignee read-only). Each control PATCHes the ticket on change.
export default function UpdateTicket({ ticket }: { ticket: TicketDetailData }) {
  // Only admins may (re)assign tickets; agents see the assignee read-only.
  const { data: session } = useSession();
  const isAdmin = session?.user.role === Role.admin;

  return (
    <Card className="bg-transparent border-0 shadow-none">
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="u-label">
              Status
            </label>
            <TicketFieldSelect
              ticketId={ticket.id}
              value={ticket.status}
              ariaLabel="Update status"
              options={agentTicketStatuses.map((s) => ({
                value: s,
                label: statusLabels[s],
              }))}
              buildPatch={(v) => ({ status: v as AgentTicketStatus })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="u-label">
              Category
            </label>
            <TicketFieldSelect
              ticketId={ticket.id}
              value={ticket.category ?? ""}
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
            <label className="u-label">
              Assigned to
            </label>
            {isAdmin ? (
              <AssigneeSelect ticketId={ticket.id} assignee={ticket.assignee} />
            ) : ticket.assignee ? (
              <p className="text-sm">{ticket.assignee.name}</p>
            ) : (
              <p className="text-muted-foreground text-sm">Unassigned</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
