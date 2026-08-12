import Navbar from "@/components/Navbar";
import TicketsTable from "@/components/TicketsTable";

export default function Tickets() {
  return (
    <div className="min-h-svh bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground text-sm">
            Filter, search, and manage incoming customer support requests.
          </p>
        </div>

        <div className="mt-6">
          <TicketsTable />
        </div>
      </main>
    </div>
  );
}
