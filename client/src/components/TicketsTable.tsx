import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  type HeaderContext,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Inbox,
  Search,
  SearchX,
  X,
} from "lucide-react";

import {
  agentTicketStatuses,
  ticketCategories,
  type TicketStatus,
  type TicketCategory,
} from "core/constants/ticket.ts";
import type { TicketListItem, TicketListResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Sentinel value for the "no filter" option in each dropdown. Radix Select items
// can't have an empty-string value, so this stands in for "all" and maps back to
// `undefined` (param omitted) when building the request.
const ALL = "all";

// Rows per page. Server-side pagination, so this is sent as the `pageSize` param.
const PAGE_SIZE = 10;

// Status chip colors. Ember is the one saturated color in the interface and it
// means exactly one thing — a human still has to deal with this — so only `open`
// gets it. Settled states read evergreen (resolved) or plain (closed). The list
// only ever shows agent-visible tickets, so the `new`/`processing` intake states
// never actually render here; they're mapped only to keep the record exhaustive
// over TicketStatus.
const statusChip: Record<TicketStatus, string> = {
  open: "bg-ember-surface border-ember-border text-ember",
  resolved: "bg-evergreen-surface border-evergreen-border text-primary",
  closed: "bg-muted border-border text-muted-foreground",
  new: "bg-muted border-border text-muted-foreground",
  processing: "bg-muted border-border text-muted-foreground",
};

// "general_question" → "general question"; null → "—". Category is assigned by
// the classifier, so it stays lowercase and renders in the mono utility face —
// it reads as a field value the system holds, not as prose someone wrote.
function formatCategory(category: TicketCategory | null): string {
  if (!category) return "—";
  return category.replace(/_/g, " ");
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
      // The label classes are set here rather than inherited from the
      // [data-slot="table-head"] base rule: Button declares its own font
      // utilities, which win over an inherited value, so a sortable header would
      // otherwise drop out of the mono utility register that plain headers use.
      className="text-muted-foreground hover:text-foreground -ml-3 h-8 font-mono text-[0.6875rem] font-medium tracking-[0.1em] uppercase"
      onClick={column.getToggleSortingHandler()}
      disabled={isPending}
    >
      {label}
      <Icon
        className={`size-3 ${sorted ? "text-foreground" : "text-muted-foreground"}`}
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
      <Link
        to={`/tickets/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.subject}
      </Link>
    ),
  },
  {
    accessorKey: "requesterName",
    header: (ctx) => <SortHeader {...ctx} label="Sender" />,
    cell: ({ row }) => (
      <>
        <div>{row.original.requesterName ?? row.original.requesterEmail}</div>
        {row.original.requesterName && (
          <div className="text-muted-foreground u-data text-xs">
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
      <Badge
        variant="outline"
        className={`u-chip ${statusChip[row.original.status]}`}
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "category",
    header: (ctx) => <SortHeader {...ctx} label="Category" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground u-data text-xs">
        {formatCategory(row.original.category)}
      </span>
    ),
  },
  {
    // Assignee isn't in the server's sortBy allowlist, so this column has a plain
    // (non-sortable) header. Unassigned tickets read "Unassigned".
    accessorKey: "assignee",
    header: "Assigned to",
    cell: ({ row }) =>
      row.original.assignee ? (
        row.original.assignee.name
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
  },
  {
    accessorKey: "createdAt",
    header: (ctx) => <SortHeader {...ctx} label="Created" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground u-data text-xs">
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
  // Filters are held as the sentinel ALL ("no filter") or a concrete value.
  const [status, setStatus] = useState<TicketStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<TicketCategory | typeof ALL>(ALL);
  // `search` is the live input value; `debouncedSearch` is what actually drives
  // the query, so typing doesn't fire a request per keystroke.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // 1-based page index. Reset to 1 whenever the result set changes (filter,
  // search, or sort) so we never land on a page that no longer exists.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [status, category, debouncedSearch, sorting]);

  const isFiltered = status !== ALL || category !== ALL || debouncedSearch !== "";

  const sort = sorting[0] ?? { id: "createdAt", desc: true };
  // Omit a filter param entirely when it's unset (ALL / blank) so the server
  // treats the field as unconstrained.
  const params = {
    sortBy: sort.id,
    order: sort.desc ? "desc" : "asc",
    ...(status !== ALL ? { status } : {}),
    ...(category !== ALL ? { category } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    page,
    pageSize: PAGE_SIZE,
  };

  const tickets = useQuery({
    queryKey: ["tickets", params],
    queryFn: async () =>
      (await api.get<TicketListResponse>("/api/tickets", { params })).data,
    // Keep the current page on screen while re-fetching (sort/filter/paginate)
    // instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  });

  const rows = tickets.data?.tickets ?? [];
  const total = tickets.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const table = useReactTable({
    data: rows,
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

  // Filter controls stay visible across every query state (loading/empty/error)
  // so the current filters are always adjustable.
  const filterBar = (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search subject or sender…"
            aria-label="Search tickets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background pl-9 text-sm"
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => setStatus(v as TicketStatus | typeof ALL)}
        >
          <SelectTrigger className="w-full bg-background sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {agentTicketStatuses.map((s) => (
              <SelectItem key={s} value={s} className="u-data text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category}
          onValueChange={(v) => setCategory(v as TicketCategory | typeof ALL)}
        >
          <SelectTrigger className="w-full bg-background sm:w-48" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {ticketCategories.map((c) => (
              <SelectItem key={c} value={c} className="u-data text-xs">
                {formatCategory(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground self-start sm:self-auto"
          onClick={() => {
            setStatus(ALL);
            setCategory(ALL);
            setSearch("");
            setDebouncedSearch("");
          }}
        >
          <X className="size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );

  let content;
  if (tickets.isPending) {
    content = (
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
        <Table>
          {header}
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 rounded-md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  } else if (tickets.isError) {
    content = (
      <ErrorAlert error={tickets.error} fallback="Failed to load tickets." />
    );
  } else if (rows.length === 0) {
    const EmptyIcon = isFiltered ? SearchX : Inbox;
    content = (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/50 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <EmptyIcon className="size-6" aria-hidden />
        </div>
        <span className="text-muted-foreground text-sm">
          {isFiltered
            ? "No tickets match the current filters."
            : "No tickets yet."}
        </span>
      </div>
    );
  } else {
    // Row range shown on the current page, e.g. "21–40 of 102".
    const firstRow = (page - 1) * PAGE_SIZE + 1;
    const lastRow = firstRow + rows.length - 1;
    content = (
      <>
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
          <Table>
            {header}
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="transition-colors hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
          <p className="text-muted-foreground u-data text-xs">
            Showing {firstRow}–{lastRow} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || tickets.isFetching}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <div className="flex items-center rounded-lg border bg-card px-3 py-1 text-xs text-muted-foreground u-data">
              Page {page} of {pageCount}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || tickets.isFetching}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {filterBar}
      {content}
    </div>
  );
}
