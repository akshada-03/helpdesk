import { useQuery } from "@tanstack/react-query";
import {
  ChartPie,
  CircleDot,
  Inbox,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

import type { TicketStatsResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import ErrorAlert from "@/components/ErrorAlert";
import TicketsPerDayChart from "@/components/TicketsPerDayChart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Formats a duration in milliseconds as a compact human string (e.g. "2h 15m",
// "45m", "30s"). Only the two most significant units are shown.
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

// One metric tile. `hint` is optional supporting text under the value; `icon`
// names the metric alongside its label.
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  colorScheme = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  colorScheme?: "indigo" | "amber" | "emerald" | "purple" | "blue" | "primary";
}) {
  const badgeStyles = {
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    primary: "bg-primary/10 text-primary border-primary/20",
  };

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-border/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="u-label text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </CardTitle>
          <div className={`flex size-8 items-center justify-center rounded-lg border ${badgeStyles[colorScheme]}`}>
            <Icon className="size-4 shrink-0" aria-hidden />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="u-data text-3xl font-bold tracking-tight">{value}</div>
        {hint && (
          <p className="text-muted-foreground u-data mt-1.5 text-xs font-medium">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const stats = useQuery({
    queryKey: ["ticket-stats"],
    queryFn: async () =>
      (await api.get<TicketStatsResponse>("/api/tickets/stats")).data,
  });

  return (
    <div className="min-h-svh bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Overview of ticket volume, agent response performance, and automated AI resolution rates.
          </p>
        </div>

        {stats.isError && (
          <div className="mt-4">
            <ErrorAlert
              error={stats.error}
              fallback="Failed to load dashboard metrics."
            />
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.isPending &&
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <Skeleton className="h-4 w-28 rounded-md" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-20 rounded-md" />
                </CardContent>
              </Card>
            ))}

          {stats.isSuccess && (
            <>
              <StatCard
                label="Total tickets"
                value={String(stats.data.total)}
                icon={Inbox}
                colorScheme="indigo"
              />
              <StatCard
                label="Open tickets"
                value={String(stats.data.open)}
                icon={CircleDot}
                colorScheme="amber"
              />
              <StatCard
                label="Resolved by AI"
                value={String(stats.data.aiResolved)}
                hint={`of ${stats.data.resolved} resolved tickets`}
                icon={Sparkles}
                colorScheme="emerald"
              />
              <StatCard
                label="% resolved by AI"
                icon={ChartPie}
                colorScheme="purple"
                value={
                  stats.data.resolved === 0
                    ? "—"
                    : `${Math.round(
                        (stats.data.aiResolved / stats.data.resolved) * 100,
                      )}%`
                }
                hint="automation resolution rate"
              />
              <StatCard
                label="Avg resolution time"
                icon={Timer}
                colorScheme="blue"
                value={
                  stats.data.avgResolutionMs === null
                    ? "—"
                    : formatDuration(stats.data.avgResolutionMs)
                }
                hint="from open to resolved"
              />
            </>
          )}
        </div>

        {stats.isSuccess && stats.data.daily.length > 0 && (
          <Card className="mt-6 border-border/80 shadow-xs">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="u-label text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Ticket volume trend
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <TicketsPerDayChart data={stats.data.daily} />
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}
