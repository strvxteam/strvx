import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { SlashCommand } from "@/components/docs/slash-command";
import type { Doc as YDoc } from "yjs";

const CURSOR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#0891b2", "#059669", "#ca8a04", "#dc2626",
];

export function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export function createExtensions(ydoc: YDoc, userName: string, userColor: string) {
  return [
    StarterKit.configure({
      undoRedo: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "text-[#2563eb] underline cursor-pointer" },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: "Type '/' for commands...",
    }),
    SlashCommand,
    Collaboration.configure({
      document: ydoc,
    }),
  ];
}
