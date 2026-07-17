import type { DailyTicketCount } from "core/schemas/tickets.ts";

// Formats a `YYYY-MM-DD` bucket key for display, kept in UTC so the label matches
// the day the server bucketed it into (parsing a bare date as local time can shift
// it across a midnight boundary).
function formatDay(
  date: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    ...opts,
    timeZone: "UTC",
  });
}

// A single-series bar chart of tickets created per day. One hue (the design
// system's chart-1 token), no legend — the caption names the series — with a
// per-bar hover tooltip and recessive axes.
export default function TicketsPerDayChart({
  data,
}: {
  data: DailyTicketCount[];
}) {
  const peak = Math.max(1, ...data.map((d) => d.count));
  // Roughly weekly x-axis ticks: first, last, and a few evenly spaced between.
  const labelStep = Math.max(1, Math.floor((data.length - 1) / 4));

  return (
    <figure>
      <div className="text-muted-foreground mb-3 flex items-baseline justify-between text-sm">
        <span>Tickets per day</span>
        <span>Last 30 days · peak {peak}/day</span>
      </div>

      <div
        className="flex h-40 items-end gap-[2px]"
        role="img"
        aria-label={`Bar chart of tickets created per day over the last ${data.length} days, peaking at ${peak}.`}
      >
        {data.map((d) => {
          const heightPct = (d.count / peak) * 100;
          return (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 items-end"
            >
              <div
                className="bg-foreground w-full rounded-t-[3px] transition-opacity group-hover:opacity-80"
                style={{
                  height:
                    d.count === 0 ? "0px" : `max(${heightPct}%, 3px)`,
                }}
                title={`${formatDay(d.date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}: ${d.count} ticket${d.count === 1 ? "" : "s"}`}
              />
              {/* Hover tooltip */}
              <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-center whitespace-nowrap shadow-md group-hover:block">
                <div className="text-xs font-medium">
                  {formatDay(d.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="text-muted-foreground text-xs">
                  {d.count} ticket{d.count === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis: sparse date labels aligned under their bars. */}
      <div className="text-muted-foreground mt-2 flex gap-[2px] text-xs">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % labelStep === 0 || i === data.length - 1 ? formatDay(d.date) : ""}
          </div>
        ))}
      </div>
    </figure>
  );
}
