"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { deleteContact } from "@/app/actions";

export function ContactRowActions({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  return (
    <DeleteConfirmDialog
      name={contactName}
      title="Delete contact"
      description={
        <>
          This will permanently delete <strong>{contactName}</strong>. Any
          engagements that reference this contact as primary will be cleared.
          This cannot be undone.
        </>
      }
      onConfirm={async () => {
        try {
          await deleteContact(contactId);
          toast.success("Contact deleted");
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to delete contact",
          );
        }
      }}
      trigger={
        <button
          type="button"
          aria-label={`Delete ${contactName}`}
          title="Delete contact"
          className="flex h-7 w-7 items-center justify-center rounded text-[#bbb] transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      }
    />
  );
}
