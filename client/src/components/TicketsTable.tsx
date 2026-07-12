import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  type HeaderContext,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { type TicketStatus, type TicketCategory } from "core/constants/ticket.ts";
import type { TicketListItem, TicketListResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Badge styling per status.
const statusVariant: Record<
  TicketStatus,
  "default" | "secondary" | "outline"
> = {
  open: "default",
  resolved: "secondary",
  closed: "outline",
};

// "general_question" → "General question"; null → "—".
function formatCategory(category: TicketCategory | null): string {
  if (!category) return "—";
  const text = category.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Meta stashed on the table so header cells can tell whether the query is loading
// (sort buttons are disabled until the first page of data arrives).
type TicketsTableMeta = { isPending: boolean };

// Column header with a click-to-sort button. Sorting is server-driven, so the
// button just toggles TanStack's sorting state, which the query turns into
// sortBy/order params.
function SortHeader({
  column,
  table,
  label,
}: HeaderContext<TicketListItem, unknown> & { label: string }) {
  const sorted = column.getIsSorted();
  const { isPending } = table.options.meta as TicketsTableMeta;
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={column.getToggleSortingHandler()}
      disabled={isPending}
    >
      {label}
      <Icon
        className={`size-3.5 ${sorted ? "text-foreground" : "text-muted-foreground"}`}
      />
    </Button>
  );
}

// Column ids double as the sortBy allowlist values on the server (subject,
// requesterName, status, category, createdAt).
const columns: ColumnDef<TicketListItem>[] = [
  {
    accessorKey: "subject",
    header: (ctx) => <SortHeader {...ctx} label="Subject" />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.subject}</span>
    ),
  },
  {
    accessorKey: "requesterName",
    header: (ctx) => <SortHeader {...ctx} label="Sender" />,
    cell: ({ row }) => (
      <>
        <div>{row.original.requesterName ?? row.original.requesterEmail}</div>
        {row.original.requesterName && (
          <div className="text-muted-foreground text-xs">
            {row.original.requesterEmail}
          </div>
        )}
      </>
    ),
  },
  {
    accessorKey: "status",
    header: (ctx) => <SortHeader {...ctx} label="Status" />,
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "category",
    header: (ctx) => <SortHeader {...ctx} label="Category" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatCategory(row.original.category)}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: (ctx) => <SortHeader {...ctx} label="Created" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

// The ticket list. Owns its own query and TanStack Table instance so the page
// stays a thin layout. Sorting happens on the server: the current sort column /
// direction is sent as sortBy/order params and drives the query key so React
// Query refetches per sort.
export default function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const sort = sorting[0] ?? { id: "createdAt", desc: true };
  const params = { sortBy: sort.id, order: sort.desc ? "desc" : "asc" };

  const tickets = useQuery({
    queryKey: ["tickets", params],
    queryFn: async () =>
      (await api.get<TicketListResponse>("/api/tickets", { params })).data
        .tickets,
    // Keep the current rows on screen while re-sorting instead of flashing the
    // skeleton.
    placeholderData: keepPreviousData,
  });

  const table = useReactTable({
    data: tickets.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    // Single-sort UX: clicking a header toggles asc/desc and always keeps one
    // column active, matching the server's single orderBy.
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    meta: { isPending: tickets.isPending } satisfies TicketsTableMeta,
  });

  // Shared header — the loading skeleton and the loaded table render the same
  // TanStack header groups, so the columns can't drift.
  const header = (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((h) => (
            <TableHead key={h.id}>
              {h.isPlaceholder
                ? null
                : flexRender(h.column.columnDef.header, h.getContext())}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );

  if (tickets.isPending) {
    return (
      <div className="rounded-md border">
        <Table>
          {header}
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (tickets.isError) {
    return (
      <ErrorAlert error={tickets.error} fallback="Failed to load tickets." />
    );
  }

  if (tickets.data.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No tickets yet.</span>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        {header}
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
