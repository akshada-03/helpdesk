import Navbar from "@/components/Navbar";
import CreateUserDialog from "@/components/CreateUserDialog";
import UsersTable from "@/components/UsersTable";

export default function Users() {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-muted-foreground mt-1 text-sm">
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
