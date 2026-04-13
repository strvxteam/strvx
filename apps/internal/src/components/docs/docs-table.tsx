"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createDocument } from "@/app/actions";

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Alex: "/avatars/alex.png",
};

type SortField = "title" | "author" | "updatedAt";
type SortDir = "asc" | "desc";

interface DocRow {
  id: string;
  title: string;
  contentText: string | null;
  authorId: string | null;
  authorName: string | null;
  updatedAt: string;
}

export function DocsTable({ docs }: { docs: DocRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let results = docs;
    if (q) {
      results = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.contentText && d.contentText.toLowerCase().includes(q))
      );
    }
    return [...results].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "title") return dir * a.title.localeCompare(b.title);
      if (sortField === "author")
        return dir * (a.authorName ?? "").localeCompare(b.authorName ?? "");
      return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    });
  }, [docs, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "title" || field === "author" ? "asc" : "desc");
    }
  }

  async function handleNewDoc() {
    setCreating(true);
    try {
      const doc = await createDocument({ title: "Untitled" });
      router.push(`/docs/${doc.id}`);
    } finally {
      setCreating(false);
    }
  }

  function getInitial(name: string | null) {
    return name ? name.charAt(0).toUpperCase() : "?";
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Docs</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-[#e0e0e0] bg-[#f5f5f5] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-[#999]" />
            <input
              type="text"
              placeholder="Search docs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-[13px] text-[#333] placeholder-[#aaa] outline-none w-[200px]"
            />
          </div>
          <button
            onClick={handleNewDoc}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-md bg-[#222] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {creating ? "Creating..." : "New Doc"}
          </button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("title")}
            >
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                Title
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("author")}
            >
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                Author
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => toggleSort("updatedAt")}
            >
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                Last Edited
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-[13px] text-[#999]">
                {search ? "No docs match your search." : "No docs yet. Create one to get started."}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((doc) => (
              <TableRow
                key={doc.id}
                className="cursor-pointer"
                onClick={() => router.push(`/docs/${doc.id}`)}
              >
                <TableCell className="text-[13px] font-medium text-[#222]">
                  {doc.title}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-[13px] text-[#666]">
                    {TEAM_AVATARS[doc.authorName ?? ""] ? (
                      <img
                        src={TEAM_AVATARS[doc.authorName ?? ""]}
                        alt={doc.authorName ?? ""}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8d5f5] text-[10px] font-semibold text-[#7c3aed]">
                        {getInitial(doc.authorName)}
                      </div>
                    )}
                    {doc.authorName ?? "Unknown"}
                  </div>
                </TableCell>
                <TableCell className="text-[13px] text-[#999]">
                  {new Date(doc.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
