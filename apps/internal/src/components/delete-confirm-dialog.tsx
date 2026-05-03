"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteConfirmDialog({
  name,
  onConfirm,
  trigger,
  title = "Delete client",
  description,
}: {
  name: string;
  onConfirm: () => Promise<void>;
  trigger: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger}</div>

      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description ?? (
              <>
                This will permanently delete <strong>{name}</strong> and all related
                data including timeline, actions, and stage history. This cannot be
                undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:flex-row sm:justify-center">
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await onConfirm();
                setOpen(false);
              });
            }}
          >
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
