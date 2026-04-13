"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import * as Y from "yjs";
import Link from "next/link";
import { MoreHorizontal, Trash2, Copy } from "lucide-react";
import { SupabaseYjsProvider } from "@/lib/supabase-yjs-provider";
import { createExtensions, getCursorColor } from "@/lib/tiptap-extensions";
import { FloatingToolbar } from "./floating-toolbar";
import { PresenceBar } from "./presence-bar";
import { SlashCommandMenu } from "./slash-command";
import { updateDocument, createDocument, deleteDocument } from "@/app/actions";

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
}

interface DocEditorProps {
  doc: {
    id: string;
    title: string;
    content: Record<string, unknown> | null;
    authorName: string | null;
    updatedAt: string;
  };
  currentUser: {
    id: string;
    name: string;
  };
}

export function DocEditor({ doc, currentUser }: DocEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const providerRef = useRef<SupabaseYjsProvider | null>(null);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveContentRef = useRef<() => void>(() => {});
  const hydrateFromDbRef = useRef<() => void>(() => {});
  const [ydoc] = useState(() => new Y.Doc());

  const userColor = getCursorColor(currentUser.id);

  const editor = useEditor({
    extensions: createExtensions(ydoc, currentUser.name, userColor),
    editorProps: {
      attributes: {
        class: "tiptap focus:outline-none min-h-[300px] text-[15px] leading-relaxed text-[#333]",
      },
    },
    immediatelyRender: false,
  });

  const saveContent = useCallback(async () => {
    if (!editor) return;
    setSaveStatus("saving");
    try {
      const json = editor.getJSON();
      const text = editor.getText();
      await updateDocument(doc.id, {
        title,
        content: json as Record<string, unknown>,
        contentText: text,
      });
      setSaveStatus("saved");
    } catch (e) {
      console.error("[DocEditor] save failed:", e);
      setSaveStatus("idle");
    }
  }, [editor, doc.id, title]);

  // Keep refs in sync so the provider always calls the latest functions
  // without needing to be recreated on every title/editor change
  useEffect(() => {
    saveContentRef.current = saveContent;
  }, [saveContent]);

  useEffect(() => {
    hydrateFromDbRef.current = () => {
      if (editor?.isEmpty && doc.content) {
        editor.commands.setContent(doc.content);
      }
    };
  }, [editor, doc.content]);

  useEffect(() => {
    if (ydoc == null) return;

    const provider = new SupabaseYjsProvider({
      documentId: doc.id,
      ydoc: ydoc,
      user: {
        userId: currentUser.id,
        userName: currentUser.name,
        userColor,
      },
      onPresenceChange: setPresenceUsers,
      onNoPeers: () => hydrateFromDbRef.current(),
    });

    provider.onSaveRequested = () => {
      saveContentRef.current();
    };

    providerRef.current = provider;

    return () => {
      provider.destroy();
      providerRef.current = null;
    };
  }, [doc.id, currentUser.id, currentUser.name, userColor, ydoc]);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      setSaveStatus("saving");
      updateDocument(doc.id, { title: newTitle }).then(() => {
        setSaveStatus("saved");
      });
    }, 500);
  }

  function handleTitleBlur() {
    if (title !== doc.title) {
      saveContent();
    }
  }

  async function handleDelete() {
    await deleteDocument(doc.id);
    router.push("/docs");
  }

  async function handleDuplicate() {
    if (!editor) return;
    const newDoc = await createDocument({
      title: `${title} (copy)`,
      content: editor.getJSON() as Record<string, unknown>,
      contentText: editor.getText(),
    });
    router.push(`/docs/${newDoc.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-[#888]">
          <Link href="/docs" className="hover:text-[#1a73e8]">
            Docs
          </Link>
          <span>/</span>
          <span className="text-[#555]">{title}</span>
          {saveStatus === "saving" && (
            <span className="ml-2 text-[11px] text-[#aaa]">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="ml-2 text-[11px] text-[#aaa]">Saved</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PresenceBar users={presenceUsers} />
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-md border border-[#e0e0e0] px-2 py-1 text-[12px] text-[#666] hover:bg-[#f5f5f5]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-lg">
                <button
                  onClick={() => { setMenuOpen(false); handleDuplicate(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[#333] hover:bg-[#f5f5f5]"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setDeleteConfirmOpen(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#e0e0e0] bg-white p-6">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          className="mb-2 w-full text-[28px] font-bold text-[#111] outline-none placeholder-[#ccc]"
          placeholder="Untitled"
        />

        <div className="mb-6 flex items-center gap-3 text-[12px] text-[#aaa]">
          <span>By {doc.authorName ?? "Unknown"}</span>
          <span>&middot;</span>
          <span>
            Last edited{" "}
            {new Date(doc.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        {editor && <FloatingToolbar editor={editor} />}
        {editor && <SlashCommandMenu editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-[#e0e0e0] bg-white p-6 shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#111]">Delete document</h3>
            <p className="mt-1.5 text-[13px] text-[#666]">
              This will permanently delete <strong>{title}</strong>. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  handleDelete();
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
