import { Skeleton } from "@/components/ui/skeleton";

// Placeholder shown while the ticket detail is loading — a title bar and a block
// standing in for the message body.
export default function TicketDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
