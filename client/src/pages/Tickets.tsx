import Navbar from "@/components/Navbar";
import TicketsTable from "@/components/TicketsTable";

export default function Tickets() {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Tickets</h1>
          <p className="text-muted-foreground mt-1">
            Support requests, newest first.
          </p>
        </div>

        <div className="mt-6">
          <TicketsTable />
        </div>
      </main>
    </div>
  );
}
