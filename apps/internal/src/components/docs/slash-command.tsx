"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import type { Editor } from "@tiptap/react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Minus,
  Quote,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Slash command items
// ---------------------------------------------------------------------------

interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: <Heading1 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: <Heading2 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: <Heading3 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Unordered list of items",
    icon: <List className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Ordered List",
    description: "Numbered list of items",
    icon: <ListOrdered className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Task List",
    description: "Checklist of tasks",
    icon: <CheckSquare className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Code Block",
    description: "Monospace code block",
    icon: <Code className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: <Minus className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Blockquote",
    description: "Quoted text block",
    icon: <Quote className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

// ---------------------------------------------------------------------------
// Plugin state & event bus
// ---------------------------------------------------------------------------

interface SlashMenuState {
  active: boolean;
  query: string;
  /** Position of the `/` character in the document */
  from: number;
  /** Screen coords of the caret */
  coords: { top: number; left: number } | null;
}

type SlashMenuListener = (state: SlashMenuState) => void;

// One subscriber per editor instance is enough.
let _listener: SlashMenuListener | null = null;

function notifyListener(state: SlashMenuState) {
  _listener?.(state);
}

const slashPluginKey = new PluginKey<SlashMenuState>("slashCommand");

// ---------------------------------------------------------------------------
// ProseMirror plugin
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildSlashPlugin(getEditor: () => Editor | null): Plugin {
  return new Plugin({
    key: slashPluginKey,
    state: {
      init(): SlashMenuState {
        return { active: false, query: "", from: -1, coords: null };
      },
      apply(tr, prev): SlashMenuState {
        const meta = tr.getMeta(slashPluginKey) as SlashMenuState | undefined;
        if (meta !== undefined) return meta;
        if (!tr.docChanged && !tr.selectionSet) return prev;
        return prev;
      },
    },
    view() {
      return {
        update(view) {
          const pluginState = slashPluginKey.getState(view.state);
          if (pluginState) notifyListener(pluginState);
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const state = slashPluginKey.getState(view.state);
        if (!state) return false;

        if (state.active) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            // Let the React component handle navigation — signal it via a
            // custom DOM event so the plugin doesn't need a ref to the UI.
            view.dom.dispatchEvent(
              new CustomEvent("slash-key", { detail: event.key })
            );
            return true;
          }
          if (event.key === "Enter") {
            view.dom.dispatchEvent(
              new CustomEvent("slash-key", { detail: "Enter" })
            );
            return true;
          }
          if (event.key === "Escape") {
            const tr = view.state.tr.setMeta(slashPluginKey, {
              active: false,
              query: "",
              from: -1,
              coords: null,
            });
            view.dispatch(tr);
            return true;
          }
        }
        return false;
      },
      handleTextInput(view, _from, _to, text) {
        if (text !== "/") return false;

        // Only trigger at the start of an empty paragraph or after whitespace
        const { $from } = view.state.selection;
        const textBefore = $from.parent.textContent.slice(
          0,
          $from.parentOffset
        );
        if (textBefore.trim() !== "") return false;

        // Defer so the `/` is inserted first
        setTimeout(() => {
          if (!view.isDestroyed) {
            const coords = view.coordsAtPos(view.state.selection.from);
            const tr = view.state.tr.setMeta(slashPluginKey, {
              active: true,
              query: "",
              from: view.state.selection.from,
              coords: { top: coords.bottom, left: coords.left },
            });
            view.dispatch(tr);
          }
        }, 0);

        return false;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tiptap Extension
// ---------------------------------------------------------------------------

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [buildSlashPlugin(() => this.editor as unknown as Editor)];
  },
});

// ---------------------------------------------------------------------------
// React menu component — mount once next to the EditorContent
// ---------------------------------------------------------------------------

interface SlashMenuProps {
  editor: Editor;
}

export function SlashCommandMenu({ editor }: SlashMenuProps) {
  const [menuState, setMenuState] = useState<SlashMenuState>({
    active: false,
    query: "",
    from: -1,
    coords: null,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to plugin updates
  useEffect(() => {
    _listener = setMenuState;
    return () => {
      _listener = null;
    };
  }, []);

  // Watch editor transaction updates to sync the query
  useEffect(() => {
    if (!editor) return;

    function onUpdate() {
      const pluginState = slashPluginKey.getState(editor.state);
      if (!pluginState?.active) return;

      // Recompute the query from current text after the `/`
      const { from } = pluginState;
      const currentPos = editor.state.selection.from;
      if (currentPos < from) {
        // cursor moved before the slash — close
        const tr = editor.state.tr.setMeta(slashPluginKey, {
          active: false,
          query: "",
          from: -1,
          coords: null,
        });
        editor.view.dispatch(tr);
        return;
      }

      const sliceText = editor.state.doc.textBetween(from, currentPos, "");
      const query = sliceText.startsWith("/")
        ? sliceText.slice(1)
        : sliceText;

      const coords = editor.view.coordsAtPos(currentPos);
      const nextState: SlashMenuState = {
        active: true,
        query,
        from,
        coords: { top: coords.bottom, left: coords.left },
      };
      setMenuState(nextState);
      setSelectedIndex(0);
    }

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  // Listen for keyboard events forwarded from the plugin
  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;

    function handleSlashKey(e: Event) {
      const key = (e as CustomEvent<string>).detail;
      setSelectedIndex((prev) => {
        const filtered = getFiltered();
        if (key === "ArrowDown") return (prev + 1) % filtered.length;
        if (key === "ArrowUp")
          return (prev - 1 + filtered.length) % filtered.length;
        if (key === "Enter") {
          executeItem(filtered[prev]);
        }
        return prev;
      });
    }

    dom.addEventListener("slash-key", handleSlashKey);
    return () => dom.removeEventListener("slash-key", handleSlashKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, menuState]);

  const getFiltered = useCallback(() => {
    const q = menuState.query.toLowerCase();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [menuState.query]);

  const executeItem = useCallback(
    (item: SlashItem | undefined) => {
      if (!item) return;

      // Delete the `/query` text that was typed
      const { from } = menuState;
      const currentPos = editor.state.selection.from;
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: currentPos })
        .run();

      item.command(editor);

      // Close the menu
      const tr = editor.state.tr.setMeta(slashPluginKey, {
        active: false,
        query: "",
        from: -1,
        coords: null,
      });
      editor.view.dispatch(tr);
    },
    [editor, menuState]
  );

  // Click outside closes the menu
  useEffect(() => {
    if (!menuState.active) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const tr = editor.state.tr.setMeta(slashPluginKey, {
          active: false,
          query: "",
          from: -1,
          coords: null,
        });
        editor.view.dispatch(tr);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editor, menuState.active]);

  if (!menuState.active || !menuState.coords) return null;

  const filtered = getFiltered();
  if (filtered.length === 0) return null;

  const safeIndex = selectedIndex % filtered.length;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuState.coords.top + 4,
        left: menuState.coords.left,
        zIndex: 9999,
      }}
      className="w-64 rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-xl"
    >
      {filtered.map((item, i) => (
        <button
          key={item.title}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeItem(item);
          }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
            i === safeIndex
              ? "bg-[#f0f4ff] text-[#1a73e8]"
              : "text-[#333] hover:bg-[#f5f5f5]"
          }`}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#e0e0e0] bg-[#fafafa] text-[#555]">
            {item.icon}
          </span>
          <span className="flex flex-col">
            <span className="text-[13px] font-medium leading-tight">
              {item.title}
            </span>
            <span className="text-[11px] text-[#888] leading-tight">
              {item.description}
            </span>
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}
