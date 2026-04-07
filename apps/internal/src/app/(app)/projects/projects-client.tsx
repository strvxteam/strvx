"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  type Project,
  type ProjectStatus,
  PROJECT_STATUS_COLORS,
} from "@/lib/mock-projects";
import { CustomSelect, MultiSelect } from "@/components/ui/custom-select";
import {
  createProject,
  updateProject,
  deleteProject,
} from "@/app/actions";
import { toast } from "sonner";

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Alex: "/avatars/alex.png",
};

const ALL_STATUSES: ProjectStatus[] = [
  "scoping",
  "active",
  "paused",
  "completed",
  "cancelled",
];

export default function ProjectsPage({
  initialProjects,
  companyNames = [],
}: {
  initialProjects: Project[];
  companyNames?: string[];
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">(
    "all"
  );
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (statusFilter === "all") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  const handleSave = (data: Partial<Project>) => {
    if (editingProject) {
      // Optimistic update
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProject.id
            ? { ...p, ...data, updatedAt: new Date() }
            : p
        )
      );
      // Persist to database
      startTransition(async () => {
        try {
          await updateProject(editingProject.id, {
            name: data.name,
            description: data.description,
            status: data.status,
            client: data.client,
            startDate: data.startDate,
            endDate: data.endDate,
            team: data.team,
          });
          toast.success("Project updated");
        } catch (err) {
          console.error(err);
          // Revert on error
          setProjects(initialProjects);
          toast.error("Failed to update project");
        }
      });
    } else {
      // Optimistic: add with temp id
      const tempId = `temp-${Date.now()}`;
      const newProject: Project = {
        id: tempId,
        name: (data.name ?? "").trim(),
        client: (data.client ?? "").trim(),
        status: data.status ?? "scoping",
        team: data.team ?? [],
        startDate: data.startDate ?? new Date().toISOString().split("T")[0],
        endDate: data.endDate ?? null,
        updatedAt: new Date(),
        description: (data.description ?? "").trim(),
        timeEntries: [],
        timeline: [],
      };
      setProjects((prev) => [newProject, ...prev]);

      // Persist to database
      startTransition(async () => {
        try {
          const created = await createProject({
            name: newProject.name,
            description: newProject.description,
            status: newProject.status,
            client: newProject.client,
            startDate: newProject.startDate,
            endDate: newProject.endDate ?? undefined,
            team: newProject.team,
          });
          // Replace temp id with real id
          setProjects((prev) =>
            prev.map((p) =>
              p.id === tempId ? { ...p, id: created.id } : p
            )
          );
          toast.success("Project created");
        } catch (err) {
          console.error(err);
          // Remove temp project on error
          setProjects((prev) => prev.filter((p) => p.id !== tempId));
          toast.error("Failed to create project");
        }
      });
    }
    setShowModal(false);
    setEditingProject(null);
  };

  const handleDelete = (id: string) => {
    // Optimistic removal
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null);

    // Persist to database (skip for temp ids)
    if (!id.startsWith("temp-")) {
      startTransition(async () => {
        try {
          await deleteProject(id);
          toast.success("Project deleted");
        } catch (err) {
          console.error(err);
          // Revert on error
          setProjects(initialProjects);
          toast.error("Failed to delete project");
        }
      });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button
          onClick={() => {
            setEditingProject(null);
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
        >
          <Plus size={14} />
          New Project
        </button>
      </div>

      {/* Status filter */}
      <div className="mb-5 flex w-fit rounded-lg border border-[#e0e0e0] bg-white">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-l-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-[#f0f0f0] text-[#111]"
              : "text-[#555] hover:bg-[#fafafa]"
          }`}
        >
          All ({projects.length})
        </button>
        {ALL_STATUSES.map((s) => {
          const count = projects.filter((p) => p.status === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[13px] font-medium capitalize transition-colors last:rounded-r-lg ${
                statusFilter === s
                  ? "bg-[#f0f0f0] text-[#111]"
                  : "text-[#555] hover:bg-[#fafafa]"
              }`}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onEdit={() => {
              setEditingProject(project);
              setShowModal(true);
            }}
            onDelete={() => setDeletingId(project.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-[13px] text-[#888]">
            No projects match this filter.
          </div>
        )}
      </div>

      {showModal && (
        <ProjectModal
          project={editingProject}
          clientOptions={[...new Set([...companyNames, ...projects.map((p) => p.client).filter(Boolean)])]}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingProject(null);
          }}
        />
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border border-[#e0e0e0] bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-[16px] font-semibold text-[#222]">
              Delete project?
            </h2>
            <p className="mb-4 text-[13px] text-[#888]">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={isPending}
                className="rounded-lg bg-[#c0392b] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#a93226] disabled:opacity-50"
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

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-lg border border-[#e0e0e0] bg-white p-4 transition-colors hover:border-[#ccc] hover:shadow-sm"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#222]">
            {project.name}
          </p>
          <p className="text-[12px] text-[#888]">{project.client}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${PROJECT_STATUS_COLORS[project.status]}`}
        >
          {project.status}
        </span>
      </div>

      {project.description && (
        <p className="mb-3 line-clamp-2 text-[12px] leading-relaxed text-[#777]">
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex -space-x-1.5">
            {project.team.slice(0, 4).map((name) => {
              const avatar = TEAM_AVATARS[name];
              return avatar ? (
                <img
                  key={name}
                  src={avatar}
                  alt={name}
                  className="h-6 w-6 rounded-full border-2 border-white object-cover"
                  title={name}
                />
              ) : (
                <div
                  key={name}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#e0e0e0] text-[9px] font-semibold text-[#666]"
                  title={name}
                >
                  {name.charAt(0)}
                </div>
              );
            })}
          </div>
          <span className="ml-2 text-[11px] text-[#aaa]">
            {new Date(project.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
            className="rounded p-1 text-[#888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222]"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="rounded p-1 text-[#888] transition-colors hover:bg-[#fde8e8] hover:text-[#c0392b]"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </Link>
  );
}

function ProjectModal({
  project,
  clientOptions,
  onSave,
  onClose,
}: {
  project: Project | null;
  clientOptions: string[];
  onSave: (data: Partial<Project>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [status, setStatus] = useState<ProjectStatus>(
    project?.status ?? "scoping"
  );
  const [description, setDescription] = useState(project?.description ?? "");
  const [team, setTeam] = useState<string[]>(project?.team ?? []);
  const [startDate, setStartDate] = useState(
    project?.startDate ?? new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(project?.endDate ?? "");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      client: client.trim(),
      status,
      description: description.trim(),
      team,
      startDate,
      endDate: endDate || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-[#e0e0e0] bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#222]">
            {project ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#888] transition-colors hover:bg-[#f0f0f0]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <FieldLabel label="Project Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client Portal Redesign"
              className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
          </FieldLabel>

          <div className="grid grid-cols-2 gap-3">
            <FieldLabel label="Client">
              <CustomSelect
                value={client}
                onChange={setClient}
                placeholder="Select client..."
                options={clientOptions.map(
                  (name) => ({ value: name, label: name })
                )}
              />
            </FieldLabel>
            <FieldLabel label="Status">
              <CustomSelect
                value={status}
                onChange={(val) => setStatus(val as ProjectStatus)}
                options={ALL_STATUSES.map((s) => ({
                  value: s,
                  label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
              />
            </FieldLabel>
          </div>

          <FieldLabel label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={3}
              className="w-full resize-none rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
            />
          </FieldLabel>

          <div className="grid grid-cols-2 gap-3">
            <FieldLabel label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
              />
            </FieldLabel>
            <FieldLabel label="End Date">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
              />
            </FieldLabel>
          </div>

          <FieldLabel label="Team">
            <MultiSelect
              values={team}
              onChange={setTeam}
              placeholder="Select team members..."
              options={[
                { value: "Nick", label: "Nick" },
                { value: "Alex", label: "Alex" },
              ]}
            />
          </FieldLabel>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="rounded-lg bg-[#111] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            {project ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-[#555]">
        {label}
      </label>
      {children}
    </div>
  );
}
