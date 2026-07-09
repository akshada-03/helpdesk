import { useQuery } from "@tanstack/react-query";

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

type Health = { status: string; timestamp: string };

export default function Home() {
  const { data: session } = useSession();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get<Health>("/api/health")).data,
  });

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold">
          Welcome, {session?.user.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered ticket management system.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>API status</CardTitle>
          </CardHeader>
          <CardContent>
            {health.isPending && (
              <span className="text-muted-foreground text-sm">
                Checking API health…
              </span>
            )}
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
