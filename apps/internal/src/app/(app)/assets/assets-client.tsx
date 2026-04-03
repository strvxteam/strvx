"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  FolderPlus,
  Upload,
  File,
  FileText,
  Image,
  Film,
  Table,
  Presentation,
  ExternalLink,
  Loader2,
  HardDrive,
  X,
} from "lucide-react";
import {
  FolderTree,
  type TreeNode,
  type FolderNode,
  type FileNode,
} from "@/components/ui/folder-tree";

// ── Types ────────────────────────────────────────────

type AssetType =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "video"
  | "folder"
  | "other";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  type: AssetType;
  modifiedTime: string;
  modifiedBy: string;
  size: string;
  starred: boolean;
  webViewLink: string;
  iconLink: string;
  parents: string[];
}

interface DriveFolder {
  id: string;
  name: string;
  children: DriveFolder[];
}

// ── Helpers ──────────────────────────────────────────

const TYPE_ICONS: Record<AssetType, React.ElementType> = {
  document: FileText,
  spreadsheet: Table,
  presentation: Presentation,
  image: Image,
  video: Film,
  folder: FolderOpen,
  other: File,
};

const TYPE_COLORS: Record<AssetType, string> = {
  document: "text-[#4285f4]",
  spreadsheet: "text-[#0f9d58]",
  presentation: "text-[#f4b400]",
  image: "text-[#db4437]",
  video: "text-[#db4437]",
  folder: "text-[#888]",
  other: "text-[#888]",
};

function driveTypeToFileNodeType(type: AssetType): FileNode["type"] {
  if (type === "folder" || type === "other") return "file";
  return type;
}

function getEmbedUrl(file: DriveFile): string {
  switch (file.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${file.id}/preview`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${file.id}/preview`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${file.id}/preview`;
    default:
      return `https://drive.google.com/file/d/${file.id}/preview`;
  }
}

function driveFoldersToTree(folders: DriveFolder[]): FolderNode[] {
  return folders.map(
    (f): FolderNode => ({
      id: f.id,
      name: f.name,
      type: "folder" as const,
      children: driveFoldersToTree(f.children),
    }),
  );
}

// ── Page ─────────────────────────────────────────────

export default function AssetsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);

  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [baseFolderTree, setBaseFolderTree] = useState<FolderNode[]>([]);
  const [filesByFolder, setFilesByFolder] = useState<Record<string, DriveFile[]>>(
    {},
  );
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(
    new Set(),
  );

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track which folders have already been fetched to avoid re-fetching
  const loadedFoldersRef = useRef<Set<string>>(new Set());
  // Keep a ref to all files for quick lookup
  const allFilesRef = useRef<Map<string, DriveFile>>(new Map());

  // Check connection status
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/drive/status");
        const data = await res.json();
        setDriveConnected(data.connected);
      } catch {
        setDriveConnected(false);
      }
    }
    checkStatus();
  }, []);

  // Fetch folder tree
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const res = await fetch("/api/drive/folders");
      if (!res.ok) throw new Error("Failed to fetch folders");
      const data = await res.json();
      setBaseFolderTree(driveFoldersToTree(data.folders || []));
    } catch {
      setBaseFolderTree([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  // Fetch files for a specific folder (or root)
  const fetchFilesForFolder = useCallback(
    async (folderId: string | null) => {
      const key = folderId ?? "__root__";
      if (loadedFoldersRef.current.has(key)) return;
      loadedFoldersRef.current.add(key);

      if (folderId) {
        setLoadingFolderIds((prev) => new Set(prev).add(folderId));
      }

      try {
        const params = new URLSearchParams();
        if (folderId) params.set("folderId", folderId);
        const res = await fetch(`/api/drive/files?${params}`);
        if (!res.ok) throw new Error("Failed to fetch files");
        const data = await res.json();
        const files: DriveFile[] = (data.files || []).filter(
          (f: DriveFile) => f.type !== "folder",
        );

        // Update the file index
        for (const f of files) {
          allFilesRef.current.set(f.id, f);
        }

        setFilesByFolder((prev) => ({ ...prev, [key]: files }));
      } catch {
        setFilesByFolder((prev) => ({ ...prev, [key]: [] }));
      } finally {
        if (folderId) {
          setLoadingFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(folderId);
            return next;
          });
        }
      }
    },
    [],
  );

  // Load data when Drive is connected
  useEffect(() => {
    if (driveConnected === true) {
      fetchFolders();
      fetchFilesForFolder(null);
    }
  }, [driveConnected, fetchFolders, fetchFilesForFolder]);

  // Build merged tree: folders + lazily loaded files
  const computedTree = useMemo(() => {
    function injectFiles(folders: FolderNode[]): TreeNode[] {
      return folders.map((folder): FolderNode => {
        const subFolders = folder.children.filter(
          (c): c is FolderNode => c.type === "folder",
        );
        const injectedChildren = injectFiles(subFolders);

        const files = filesByFolder[folder.id] || [];
        const fileNodes: FileNode[] = files.map((f) => ({
          id: f.id,
          name: f.name,
          type: driveTypeToFileNodeType(f.type),
        }));

        return {
          ...folder,
          children: [...injectedChildren, ...fileNodes],
        };
      });
    }

    const treeFolders = injectFiles(baseFolderTree);

    // Add root-level files
    const rootFiles = filesByFolder["__root__"] || [];
    const rootFileNodes: FileNode[] = rootFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: driveTypeToFileNodeType(f.type),
    }));

    return [...treeFolders, ...rootFileNodes];
  }, [baseFolderTree, filesByFolder]);

  // Handle selecting a node in the tree
  function handleTreeSelect(id: string) {
    setSelectedId(id);

    const file = allFilesRef.current.get(id);
    if (file) {
      setSelectedFile(file);
    } else {
      // Clicked a folder — clear preview
      setSelectedFile(null);
    }
  }

  // Lazy-load files when a folder is expanded
  function handleFolderExpand(folderId: string) {
    fetchFilesForFolder(folderId);
  }

  // Move a file or folder into a target folder (drag-and-drop)
  async function handleMove(itemId: string, targetFolderId: string) {
    try {
      const res = await fetch("/api/drive/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: itemId, newParentId: targetFolderId }),
      });
      if (!res.ok) throw new Error("Failed to move");

      // Find old parent so we can refresh both source and target
      const file = allFilesRef.current.get(itemId);
      const oldParentId = file?.parents[0] ?? null;

      // Refresh source folder, target folder, and the folder tree
      refreshFolder(oldParentId);
      refreshFolder(targetFolderId);
      await fetchFolders();
    } catch (err) {
      console.error("Failed to move item:", err);
    }
  }

  // Determine which folder is currently "active" for creating children
  // If a folder is selected, use its id; otherwise root
  function getActiveFolderId(): string | null {
    if (!selectedId) return null;
    // Check if selectedId is a folder (not in allFilesRef = it's a folder)
    const isFile = allFilesRef.current.has(selectedId);
    if (!isFile) return selectedId;
    // If a file is selected, create in its parent folder
    const file = allFilesRef.current.get(selectedId);
    return file?.parents[0] ?? null;
  }

  // Refresh a specific folder's files (clears cache so it re-fetches)
  function refreshFolder(folderId: string | null) {
    const key = folderId ?? "__root__";
    loadedFoldersRef.current.delete(key);
    fetchFilesForFolder(folderId);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const parentId = getActiveFolderId();
      const res = await fetch("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      if (!res.ok) throw new Error("Failed to create folder");

      // Refresh folder tree + parent's files
      setNewFolderName("");
      setShowNewFolder(false);
      await fetchFolders();
      refreshFolder(parentId);
    } catch (err) {
      console.error("Failed to create folder:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const parentId = getActiveFolderId();
      const formData = new FormData();
      formData.append("file", file);
      if (parentId) formData.append("parentId", parentId);

      const res = await fetch("/api/drive/files", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload file");

      const data = await res.json();
      const uploaded: DriveFile = data.file;
      allFilesRef.current.set(uploaded.id, uploaded);

      // Refresh the parent folder's file list
      refreshFolder(parentId);
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleConnect() {
    window.location.href = "/api/auth/google?returnTo=/assets";
  }

  // ── Checking state ──────────────────────────────────

  if (driveConnected === null) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="mb-5 shrink-0">
          <h1 className="text-xl font-semibold">Assets</h1>
          <p className="mt-0.5 text-[12px] text-[#999]">
            Documents, files, and media linked to your projects
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#aaa]" />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="mb-5 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <p className="mt-0.5 text-[12px] text-[#999]">
            Documents, files, and media linked to your projects
          </p>
        </div>
        {!driveConnected && (
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 rounded-lg border border-[#e0e0e0] bg-white px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 87.3 78"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
                fill="#0066da"
              />
              <path
                d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
                fill="#00ac47"
              />
              <path
                d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85z"
                fill="#ea4335"
              />
              <path
                d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
                fill="#00832d"
              />
              <path
                d="m59.8 53h-32.3L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h22.6c1.6 0 3.15-.45 4.5-1.2z"
                fill="#2684fc"
              />
              <path
                d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                fill="#ffba00"
              />
            </svg>
            Connect Google Drive
          </button>
        )}
      </div>

      {!driveConnected ? (
        /* ── Connect prompt ─────────────────────────────── */
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa]">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f0f0]">
            <HardDrive size={28} strokeWidth={1.5} className="text-[#999]" />
          </div>
          <h2 className="mb-1 text-[15px] font-semibold text-[#333]">
            Connect Google Drive
          </h2>
          <p className="mb-5 max-w-sm text-center text-[13px] text-[#888]">
            Link your Google Drive to browse, search, and organize files
            alongside your projects.
          </p>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 rounded-lg bg-[#1a73e8] px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1557b0]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 87.3 78"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
                fill="#ffffff80"
              />
              <path
                d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
                fill="#ffffff80"
              />
              <path
                d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85z"
                fill="#ffffffb3"
              />
              <path
                d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
                fill="#ffffff80"
              />
              <path
                d="m59.8 53h-32.3L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h22.6c1.6 0 3.15-.45 4.5-1.2z"
                fill="#ffffffb3"
              />
              <path
                d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                fill="#ffffffb3"
              />
            </svg>
            Connect Google Drive
          </button>
        </div>
      ) : (
        /* ── Main layout: tree sidebar + preview ────────── */
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* File tree sidebar */}
          <div className="w-64 shrink-0 overflow-auto rounded-lg border border-[#e0e0e0] bg-white">
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#aaa]">
                Files
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowNewFolder(true)}
                  disabled={creating}
                  className="rounded p-1 text-[#999] transition-colors hover:bg-[#f0f0f0] hover:text-[#555]"
                  title="New folder"
                >
                  <FolderPlus size={14} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded p-1 text-[#999] transition-colors hover:bg-[#f0f0f0] hover:text-[#555]"
                  title="Upload file"
                >
                  {uploading ? (
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <Upload size={14} strokeWidth={1.5} />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>

            {/* New folder inline input */}
            {showNewFolder && (
              <div className="flex items-center gap-1 border-b border-[#f0f0f0] px-2 py-1.5">
                <FolderPlus size={14} strokeWidth={1.5} className="shrink-0 text-[#f4b400]" />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") {
                      setShowNewFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="Folder name..."
                  className="min-w-0 flex-1 rounded border-none bg-transparent py-0.5 text-[13px] outline-none placeholder:text-[#ccc]"
                  disabled={creating}
                />
                {creating ? (
                  <Loader2 size={13} className="shrink-0 animate-spin text-[#aaa]" />
                ) : (
                  <button
                    onClick={() => {
                      setShowNewFolder(false);
                      setNewFolderName("");
                    }}
                    className="shrink-0 rounded p-0.5 text-[#ccc] hover:text-[#888]"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            )}

            <div className="px-1">
              {foldersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-[#aaa]" />
                </div>
              ) : computedTree.length > 0 ? (
                <FolderTree
                  tree={computedTree}
                  selectedId={selectedId}
                  onSelect={handleTreeSelect}
                  onExpand={handleFolderExpand}
                  onMove={handleMove}
                  loadingFolderIds={loadingFolderIds}
                />
              ) : (
                <p className="px-3 py-4 text-[12px] text-[#aaa]">No files</p>
              )}
            </div>
          </div>

          {/* Preview panel */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
            {selectedFile ? (
              <>
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {(() => {
                      const Icon = TYPE_ICONS[selectedFile.type] || File;
                      return (
                        <Icon
                          size={16}
                          strokeWidth={1.5}
                          className={
                            TYPE_COLORS[selectedFile.type] || "text-[#888]"
                          }
                        />
                      );
                    })()}
                    <span className="truncate text-[14px] font-medium text-[#222]">
                      {selectedFile.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-[#aaa]">
                      {selectedFile.size}
                    </span>
                  </div>
                  <a
                    href={selectedFile.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
                  >
                    <ExternalLink size={13} strokeWidth={1.5} />
                    Open in Drive
                  </a>
                </div>

                {/* Embedded preview */}
                <iframe
                  key={selectedFile.id}
                  src={getEmbedUrl(selectedFile)}
                  className="flex-1"
                  title={selectedFile.name}
                  allow="autoplay"
                />
              </>
            ) : (
              /* Empty state */
              <div className="flex flex-1 flex-col items-center justify-center">
                <File
                  size={48}
                  strokeWidth={1}
                  className="mb-3 text-[#ddd]"
                />
                <p className="text-[14px] font-medium text-[#888]">
                  Select a file to preview
                </p>
                <p className="mt-1 text-[12px] text-[#bbb]">
                  Choose a file from the tree to view its contents
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
