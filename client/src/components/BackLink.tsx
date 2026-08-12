import { Link, type LinkProps } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function BackLink({
  children,
  to,
  ...props
}: LinkProps) {
  return (
    <Link
      to={to}
      className="group text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-sm font-medium transition-all hover:bg-accent/60"
      {...props}
    >
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
