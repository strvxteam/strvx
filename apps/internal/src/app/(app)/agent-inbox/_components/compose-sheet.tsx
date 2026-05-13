"use client";

import { useState, useTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { sendComposedReply } from "../_actions";

export type ComposeInitial = {
  threadId: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
};

export function ComposeSheet({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ComposeInitial | null;
}) {
  const [toEmails, setToEmails] = useState<string[]>(initial?.toEmails ?? []);
  const [ccEmails, setCcEmails] = useState<string[]>(initial?.ccEmails ?? []);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [pending, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: "Write your reply…",
      }),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-[240px] outline-none text-[14px] leading-relaxed",
      },
    },
  });

  function handleSend() {
    if (!initial) return;
    if (!editor) return;
    const bodyHtml = editor.getHTML();
    const bodyText = editor.getText();
    if (!bodyText.trim()) {
      toast.error("Empty message.");
      return;
    }
    if (toEmails.length === 0) {
      toast.error("Add at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required.");
      return;
    }

    const fd = new FormData();
    fd.append("threadId", initial.threadId);
    fd.append("toEmails", JSON.stringify(toEmails));
    fd.append("ccEmails", JSON.stringify(ccEmails));
    fd.append("bccEmails", JSON.stringify([]));
    fd.append("subject", subject);
    fd.append("bodyText", bodyText);
    fd.append("bodyHtml", bodyHtml);

    startTransition(async () => {
      try {
        await sendComposedReply(fd);
        toast.success("Sending…");
        editor.commands.clearContent();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Send failed");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-2xl"
        style={{ width: "100%", maxWidth: "42rem" }}
      >
        <SheetHeader
          className="shrink-0 border-b px-6 py-4"
          style={{ borderColor: "#e0e0e0" }}
        >
          <SheetTitle style={{ fontSize: 16 }}>Compose</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          <RecipientField label="To" emails={toEmails} onChange={setToEmails} />
          <RecipientField label="Cc" emails={ccEmails} onChange={setCcEmails} />
          <div
            className="flex items-center gap-2 border-b pb-2"
            style={{ borderColor: "#f0f0f0" }}
          >
            <label
              className="w-12 shrink-0 text-[12px]"
              style={{ color: "#888" }}
            >
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-[14px] outline-none"
              placeholder="Subject"
            />
          </div>
          <div className="pt-2">
            <EditorContent editor={editor} />
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3"
          style={{ borderColor: "#e0e0e0", background: "#f8f8f8" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-[13px] hover:bg-[#f0f0f0]"
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={pending}
            className="rounded-md px-4 py-1.5 text-[13px] font-medium"
            style={{ background: "#1a73e8", color: "#ffffff" }}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecipientField({
  label,
  emails,
  onChange,
}: {
  label: string;
  emails: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const trimmed = draft.trim().replace(/[,;]$/, "").trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (!emails.includes(trimmed)) onChange([...emails, trimmed]);
    setDraft("");
  }

  return (
    <div
      className="flex items-center gap-2 border-b pb-2"
      style={{ borderColor: "#f0f0f0" }}
    >
      <label
        className="w-12 shrink-0 text-[12px]"
        style={{ color: "#888" }}
      >
        {label}
      </label>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {emails.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px]"
            style={{ background: "#f0f0f0", color: "#222" }}
          >
            {e}
            <button
              type="button"
              onClick={() => onChange(emails.filter((x) => x !== e))}
              className="ml-1"
              style={{ color: "#888" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" ||
              e.key === "," ||
              e.key === ";" ||
              e.key === "Tab"
            ) {
              if (draft.trim()) {
                e.preventDefault();
                commitDraft();
              }
            } else if (
              e.key === "Backspace" &&
              draft === "" &&
              emails.length > 0
            ) {
              onChange(emails.slice(0, -1));
            }
          }}
          onBlur={commitDraft}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] outline-none"
          placeholder={emails.length === 0 ? "Add address…" : ""}
        />
      </div>
    </div>
  );
}
