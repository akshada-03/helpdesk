import { useQuery } from "@tanstack/react-query";

import type { TicketStatsResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import Navbar from "@/components/Navbar";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Health = { status: string; timestamp: string };

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

// One metric tile. `hint` is optional supporting text under the value.
function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        {hint && <p className="text-muted-foreground mt-1 text-sm">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: session } = useSession();

  const stats = useQuery({
    queryKey: ["ticket-stats"],
    queryFn: async () =>
      (await api.get<TicketStatsResponse>("/api/tickets/stats")).data,
  });

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get<Health>("/api/health")).data,
  });

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">
          Dashboard 
        </h1>
        <p className="text-muted-foreground mt-1">
          Ticket volume and AI auto-resolution performance.
        </p>

        {stats.isError && (
          <ErrorAlert
            error={stats.error}
            fallback="Failed to load dashboard metrics."
          />
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.isPending &&
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-16" />
                </CardContent>
              </Card>
            ))}

          {stats.isSuccess && (
            <>
              <StatCard label="Total tickets" value={String(stats.data.total)} />
              <StatCard label="Open tickets" value={String(stats.data.open)} />
              <StatCard
                label="Resolved by AI"
                value={String(stats.data.aiResolved)}
                hint={`of ${stats.data.resolved} resolved`}
              />
              <StatCard
                label="% resolved by AI"
                value={
                  stats.data.resolved === 0
                    ? "—"
                    : `${Math.round(
                        (stats.data.aiResolved / stats.data.resolved) * 100,
                      )}%`
                }
                hint="of resolved tickets"
              />
              <StatCard
                label="Avg resolution time"
                value={
                  stats.data.avgResolutionMs === null
                    ? "—"
                    : formatDuration(stats.data.avgResolutionMs)
                }
              />
            </>
          )}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>API status</CardTitle>
          </CardHeader>
          <CardContent>
            {health.isPending && <Skeleton className="h-5 w-72" />}
            {health.isError && (
              <ErrorAlert
                error={health.error}
                fallback="Could not reach the API."
              />
            )}
            {health.isSuccess && (
              <span className="text-sm">
                ✓ API is healthy (status: {health.data.status}, checked{" "}
                {new Date(health.data.timestamp).toLocaleTimeString()})
              </span>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
