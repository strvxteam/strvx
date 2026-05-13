"use client";

import { useState } from "react";
import { ComposeSheet, type ComposeInitial } from "./compose-sheet";

export function ReplyButton({ initial }: { initial: ComposeInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-shortcut="reply"
        className="rounded-md px-3 py-1.5 text-[13px] font-medium"
        style={{ background: "#1a73e8", color: "#ffffff" }}
      >
        Reply
      </button>
      <ComposeSheet open={open} onOpenChange={setOpen} initial={initial} />
    </>
  );
}
