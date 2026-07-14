import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// A muted "back" navigation link with a leading arrow. `to` is the destination
// and the children are the label, so it works for any back-to-list navigation.
export default function BackLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}
