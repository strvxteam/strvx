import type { LucideIcon } from "lucide-react";
import {
  Plus, UserPlus, CheckSquare, FileText, MessageSquare, Bookmark,
  BookmarkX, Settings, LogOut, ListChecks, Link as LinkIcon,
} from "lucide-react";

export type CommandId =
  | "new-engagement"
  | "new-contact"
  | "new-task"
  | "new-invoice"
  | "log-interaction"
  | "add-next-action"
  | "add-followup-link"
  | "pin-current"
  | "unpin-current"
  | "go-settings"
  | "sign-out";

export type Command = {
  id: CommandId;
  label: string;
  icon: LucideIcon;
  requiresContext?: "engagement";
  keywords: string[];
};

export const COMMANDS: Command[] = [
  { id: "new-engagement", label: "New engagement", icon: Plus, keywords: ["create", "engagement", "deal", "new"] },
  { id: "new-contact", label: "New contact", icon: UserPlus, keywords: ["create", "contact", "person", "new"] },
  { id: "new-task", label: "New task", icon: CheckSquare, keywords: ["create", "task", "todo", "new"] },
  { id: "new-invoice", label: "New invoice", icon: FileText, keywords: ["create", "invoice", "bill", "new"] },
  { id: "log-interaction", label: "Log interaction", icon: MessageSquare, requiresContext: "engagement", keywords: ["log", "note", "call", "email", "interaction"] },
  { id: "add-next-action", label: "Add next action", icon: ListChecks, requiresContext: "engagement", keywords: ["action", "todo", "follow up", "next"] },
  { id: "add-followup-link", label: "Add follow-up link", icon: LinkIcon, requiresContext: "engagement", keywords: ["link", "calendly", "loom", "doc"] },
  { id: "pin-current", label: "Pin current page", icon: Bookmark, keywords: ["pin", "favorite", "bookmark"] },
  { id: "unpin-current", label: "Unpin current page", icon: BookmarkX, keywords: ["unpin", "remove pin"] },
  { id: "go-settings", label: "Go to settings", icon: Settings, keywords: ["settings", "preferences"] },
  { id: "sign-out", label: "Sign out", icon: LogOut, keywords: ["sign out", "log out", "logout"] },
];

export function matchCommands(query: string, hasEngagementContext: boolean): Command[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => {
    if (c.requiresContext === "engagement" && !hasEngagementContext) return false;
    if (c.label.toLowerCase().includes(q)) return true;
    return c.keywords.some((k) => k.includes(q));
  });
}
