import { Link, useNavigate } from "react-router-dom";
import { LifeBuoy, LogOut, Ticket, Users } from "lucide-react";

import { Role } from "core/constants/role.ts";
import { signOut, useSession } from "@/lib/auth-client";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="bg-card border-b">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-5">
          <Link
            to="/"
            className="text-primary flex items-center gap-2 font-mono text-sm font-semibold tracking-[0.16em] uppercase"
          >
            <LifeBuoy className="size-4" />
            Helpdesk
          </Link>
          {session && (
            <Link
              to="/tickets"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
            >
              <Ticket className="size-4" />
              Tickets
            </Link>
          )}
          {session?.user.role === Role.admin && (
            <Link
              to="/users"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
            >
              <Users className="size-4" />
              Users
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {session && (
            <span className="text-muted-foreground text-sm">
              {session.user.name}
            </span>
          )}
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
