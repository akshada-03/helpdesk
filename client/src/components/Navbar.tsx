import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy, LogOut, Menu, Shield, Ticket, User, Users, X } from "lucide-react";

import { Role } from "core/constants/role.ts";
import { signOut, useSession } from "@/lib/auth-client";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const isTicketsActive = location.pathname.startsWith("/tickets");
  const isUsersActive = location.pathname.startsWith("/users");
  const isHomeActive = location.pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md transition-all shadow-xs">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-primary flex items-center gap-2.5 font-mono text-base font-bold tracking-widest uppercase transition-opacity hover:opacity-90"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LifeBuoy className="size-5" />
            </div>
            <span>Helpdesk</span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            {session && (
              <Link
                to="/tickets"
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isTicketsActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Ticket className="size-4" />
                Tickets
              </Link>
            )}
            {session?.user.role === Role.admin && (
              <Link
                to="/users"
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isUsersActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Users className="size-4" />
                Users
              </Link>
            )}
          </nav>
        </div>

        {/* User Actions & Controls */}
        <div className="flex items-center gap-2.5">
          {session && (
            <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-sm shadow-xs sm:flex">
              <div className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" />
              </div>
              <span className="font-medium text-foreground text-xs sm:text-sm">
                {session.user.name}
              </span>
              {session.user.role === Role.admin ? (
                <Badge variant="outline" className="u-chip bg-primary/10 border-primary/20 text-primary text-[10px]">
                  <Shield className="mr-0.5 size-2.5" />
                  admin
                </Badge>
              ) : (
                <Badge variant="outline" className="u-chip bg-muted border-border text-muted-foreground text-[10px]">
                  agent
                </Badge>
              )}
            </div>
          )}

          <ThemeToggle />

          <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex">
            <LogOut className="size-4" />
            Sign out
          </Button>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="border-t bg-card px-4 pt-3 pb-4 shadow-lg md:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-1.5">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isHomeActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <LifeBuoy className="size-4" />
              Dashboard
            </Link>
            {session && (
              <Link
                to="/tickets"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isTicketsActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Ticket className="size-4" />
                Tickets
              </Link>
            )}
            {session?.user.role === Role.admin && (
              <Link
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isUsersActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Users className="size-4" />
                Users
              </Link>
            )}
            {session && (
              <div className="mt-2 flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{session.user.name}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="size-3.5" />
                  Sign out
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
