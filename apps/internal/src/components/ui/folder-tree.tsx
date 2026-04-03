"use client";

import { useState, useRef } from "react";
import { Collapsible } from "@base-ui/react";
import {
  ChevronRight,
  FolderOpen,
  Folder,
  FileText,
  Table,
  Presentation,
  Image,
  Film,
  File,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────

export interface FolderNode {
  id: string;
  name: string;
  type: "folder";
  children: TreeNode[];
}

export interface FileNode {
  id: string;
  name: string;
  type: "document" | "spreadsheet" | "presentation" | "image" | "video" | "file";
}

export type TreeNode = FolderNode | FileNode;

// ── Shared props threaded through the tree ───────────

interface TreeCallbacks {
  onSelect: (id: string) => void;
  onExpand?: (folderId: string) => void;
  onMove?: (itemId: string, targetFolderId: string) => void;
  loadingFolderIds?: Set<string>;
  selectedId: string | null;
}

// ── Icons ────────────────────────────────────────────

const FILE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  document: { icon: FileText, color: "text-[#4285f4]" },
  spreadsheet: { icon: Table, color: "text-[#0f9d58]" },
  presentation: { icon: Presentation, color: "text-[#f4b400]" },
  image: { icon: Image, color: "text-[#db4437]" },
  video: { icon: Film, color: "text-[#db4437]" },
  file: { icon: File, color: "text-[#888]" },
};

const DRAG_DATA_TYPE = "application/x-tree-node-id";

// ── Tree Folder ─────────────────────────────────────

function TreeFolder({
  node,
  depth,
  cb,
}: {
  node: FolderNode;
  depth: number;
  cb: TreeCallbacks;
}) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const isSelected = cb.selectedId === node.id;
  const isLoading = cb.loadingFolderIds?.has(node.id);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(DRAG_DATA_TYPE, node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragOver(true);
  }

  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    const draggedId = e.dataTransfer.getData(DRAG_DATA_TYPE);
    if (draggedId && draggedId !== node.id && cb.onMove) {
      cb.onMove(draggedId, node.id);
    }
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        draggable
        onDragStart={handleDragStart}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
          dragOver
            ? "bg-[#e8f0fe] ring-1 ring-inset ring-[#1a73e8]"
            : isSelected
              ? "bg-[#e8f0fe] font-medium text-[#1a73e8]"
              : "text-[#333] hover:bg-[#f5f5f5]"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={(e) => {
          e.preventDefault();
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && cb.onExpand) {
            cb.onExpand(node.id);
          }
        }}
      >
        {isLoading ? (
          <Loader2
            size={12}
            strokeWidth={2}
            className="shrink-0 animate-spin text-[#aaa]"
          />
        ) : (
          <ChevronRight
            size={12}
            strokeWidth={2}
            className={`shrink-0 text-[#aaa] transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
        {open ? (
          <FolderOpen size={15} strokeWidth={1.5} className="shrink-0 text-[#f4b400]" />
        ) : (
          <Folder size={15} strokeWidth={1.5} className="shrink-0 text-[#f4b400]" />
        )}
        <span className="truncate">{node.name}</span>
        {node.children.length > 0 && (
          <span className="ml-auto shrink-0 text-[11px] text-[#bbb]">
            {node.children.length}
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {node.children.map((child) =>
          child.type === "folder" ? (
            <TreeFolder key={child.id} node={child} depth={depth + 1} cb={cb} />
          ) : (
            <TreeFile key={child.id} node={child} depth={depth + 1} cb={cb} />
          ),
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

// ── Tree File ───────────────────────────────────────

function TreeFile({
  node,
  depth,
  cb,
}: {
  node: FileNode;
  depth: number;
  cb: TreeCallbacks;
}) {
  const { icon: Icon, color } = FILE_ICONS[node.type] ?? FILE_ICONS.file;
  const isSelected = cb.selectedId === node.id;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(DRAG_DATA_TYPE, node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={() => cb.onSelect(node.id)}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-[#f5f5f5] ${
        isSelected ? "bg-[#e8f0fe] font-medium text-[#1a73e8]" : "text-[#333]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 22}px` }}
    >
      <Icon size={14} strokeWidth={1.5} className={`shrink-0 ${color}`} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// ── Tree Root ────────────────────────────────────────

export function FolderTree({
  tree,
  selectedId,
  onSelect,
  onExpand,
  onMove,
  loadingFolderIds,
}: {
  tree: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExpand?: (folderId: string) => void;
  onMove?: (itemId: string, targetFolderId: string) => void;
  loadingFolderIds?: Set<string>;
}) {
  const cb: TreeCallbacks = {
    onSelect,
    onExpand,
    onMove,
    loadingFolderIds,
    selectedId,
  };

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {tree.map((node) =>
        node.type === "folder" ? (
          <TreeFolder key={node.id} node={node} depth={0} cb={cb} />
        ) : (
          <TreeFile key={node.id} node={node} depth={0} cb={cb} />
        ),
      )}
    </div>
  );
}
