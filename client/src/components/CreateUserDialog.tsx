import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import UserFormDialog from "@/components/UserFormDialog";

// The "New user" entry point: a button that opens UserFormDialog in create mode.
// All form logic lives in UserFormDialog (shared with the edit flow).
export default function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New user
      </Button>
      <UserFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
