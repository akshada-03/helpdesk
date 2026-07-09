import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <span className="font-semibold">Helpdesk</span>
        <div className="flex items-center gap-3">
          {session && (
            <span className="text-muted-foreground text-sm">
              {session.user.name}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
