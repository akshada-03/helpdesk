import Navbar from "@/components/Navbar";
import CreateUserDialog from "@/components/CreateUserDialog";
import UsersTable from "@/components/UsersTable";

export default function Users() {
  return (
    <div className="min-h-svh bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground text-sm">
              Everyone with access to the helpdesk.
            </p>
          </div>
          <CreateUserDialog />
        </div>

        <div className="mt-6">
          <UsersTable />
        </div>
      </main>
    </div>
  );
}
