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
      <div className="text-muted-foreground mb-4 flex items-baseline justify-between">
        <span className="u-label text-xs uppercase font-semibold">Tickets per day</span>
        <span className="u-data text-xs font-medium">Last {data.length} days · peak <strong className="text-foreground font-semibold">{peak}</strong>/day</span>
      </div>

      <div className="relative pt-2">
        {/* Background reference grid lines */}
        <div className="pointer-events-none absolute inset-x-0 top-2 bottom-6 flex flex-col justify-between border-y border-dashed border-border/40">
          <div className="border-b border-dashed border-border/30 w-full" />
          <div className="border-b border-dashed border-border/30 w-full" />
        </div>

        <div
          className="relative flex h-44 items-end gap-1 px-1"
          role="img"
          aria-label={`Bar chart of tickets created per day over the last ${data.length} days, peaking at ${peak}.`}
        >
          {data.map((d) => {
            const heightPct = (d.count / peak) * 100;
            return (
              <div
                key={d.date}
                className="group relative flex h-full flex-1 items-end justify-center"
              >
                <div
                  className="w-full max-w-[14px] rounded-t-sm bg-gradient-to-t from-primary/60 to-primary transition-all duration-200 group-hover:from-primary group-hover:to-primary/80 group-hover:scale-y-[1.02]"
                  style={{
                    height:
                      d.count === 0 ? "0px" : `max(${heightPct}%, 4px)`,
                  }}
                  title={`${formatDay(d.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}: ${d.count} ticket${d.count === 1 ? "" : "s"}`}
                />
                {/* Hover tooltip */}
                <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-lg border border-border/80 px-2.5 py-1.5 text-center shadow-md group-hover:block animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="text-xs font-semibold">
                    {formatDay(d.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-primary text-xs font-bold u-data">
                    {d.count} ticket{d.count === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis: sparse date labels aligned under their bars. */}
      <div className="text-muted-foreground u-data mt-3 flex gap-1 px-1 text-[0.6875rem]">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center font-medium">
            {i % labelStep === 0 || i === data.length - 1 ? formatDay(d.date) : ""}
          </div>
        ))}
      </div>
    </figure>
  );
}
