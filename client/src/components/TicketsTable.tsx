import { useEffect, useState } from "react";
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

import {
  ticketCategories,
  ticketStatuses,
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

// Badge styling per status.
const statusVariant: Record<
  TicketStatus,
  "default" | "secondary" | "outline"
> = {
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
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Search tickets…"
        aria-label="Search tickets"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-64"
      />

      <Select
        value={status}
        onValueChange={(v) => setStatus(v as TicketStatus | typeof ALL)}
      >
        <SelectTrigger className="w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {ticketStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {capitalize(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={category}
        onValueChange={(v) => setCategory(v as TicketCategory | typeof ALL)}
      >
        <SelectTrigger className="w-48" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {ticketCategories.map((c) => (
            <SelectItem key={c} value={c}>
              {formatCategory(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus(ALL);
            setCategory(ALL);
            setSearch("");
            setDebouncedSearch("");
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );

  let content;
  if (tickets.isPending) {
    content = (
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
  } else if (tickets.isError) {
    content = (
      <ErrorAlert error={tickets.error} fallback="Failed to load tickets." />
    );
  } else if (rows.length === 0) {
    content = (
      <span className="text-muted-foreground text-sm">
        {isFiltered
          ? "No tickets match the current filters."
          : "No tickets yet."}
      </span>
    );
  } else {
    // Row range shown on the current page, e.g. "21–40 of 102".
    const firstRow = (page - 1) * PAGE_SIZE + 1;
    const lastRow = firstRow + rows.length - 1;
    content = (
      <>
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

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {firstRow}–{lastRow} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || tickets.isFetching}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || tickets.isFetching}
            >
              Next
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
