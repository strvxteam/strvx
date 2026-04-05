"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import { TaskFilters } from "./task-filters";
import { AddTaskModal } from "./add-task-modal";
import { TaskDetailDrawer } from "./task-detail-drawer";
import {
  TASK_STATUS_COLUMNS,
  PRIORITY_ORDER,
  ASSIGNEES,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/mock-tasks";
import {
  createTask as createTaskAction,
  updateTask as updateTaskAction,
  deleteTask as deleteTaskAction,
} from "@/app/actions";
import { toast } from "sonner";
import type { ProjectOption, ClientOption } from "./tasks-board-loader";

type Assignee = (typeof ASSIGNEES)[number];

interface TasksBoardProps {
  initialTasks: Task[];
  userNameToId: Record<string, string>;
  projects: ProjectOption[];
  clients: ClientOption[];
  autoOpenAdd?: boolean;
  defaultProjectId?: string;
}

export function TasksBoard({ initialTasks, userNameToId, projects, clients, autoOpenAdd, defaultProjectId }: TasksBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(() =>
    initialTasks.map((t) => ({
      ...t,
      createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
    }))
  );
  const [assigneeFilter, setAssigneeFilter] = useState<Assignee | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">(
    "all"
  );
  const [sortBy, setSortBy] = useState<"priority" | "dueDate" | "createdAt">(
    "priority"
  );
  const [showAddModal, setShowAddModal] = useState(autoOpenAdd ?? false);
  const [addModalDefaultStatus, setAddModalDefaultStatus] = useState<
    TaskStatus | undefined
  >();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartStatusRef = useRef<TaskStatus | null>(null);

  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      map[p.id] = p.client ? `${p.client} — ${p.name}` : p.name;
    }
    return map;
  }, [projects]);

  const clientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) {
      map[c.id] = c.name;
    }
    return map;
  }, [clients]);

  // Always read selected task from the live tasks array so edits are reflected
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (assigneeFilter !== "all") {
      result = result.filter((t) => t.assignees.includes(assigneeFilter));
    }
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    return result;
  }, [tasks, assigneeFilter, priorityFilter]);

  const sortedTasksByColumn = useMemo(() => {
    const columns: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
    };
    for (const task of filteredTasks) {
      columns[task.status].push(task);
    }
    const sortFn = (a: Task, b: Task) => {
      if (sortBy === "priority") {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      if (sortBy === "dueDate") {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    };
    for (const status of TASK_STATUS_COLUMNS) {
      columns[status].sort(sortFn);
    }
    return columns;
  }, [filteredTasks, sortBy]);

  const findColumn = useCallback(
    (id: string): TaskStatus | null => {
      const task = tasks.find((t) => t.id === id);
      return task?.status ?? null;
    },
    [tasks]
  );

  // Drag handlers
  function handleDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    setActiveId(taskId);
    dragStartStatusRef.current = findColumn(taskId);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    const activeColumn = findColumn(activeTaskId);
    const overColumn =
      TASK_STATUS_COLUMNS.includes(overId as TaskStatus)
        ? (overId as TaskStatus)
        : findColumn(overId);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === activeTaskId ? { ...t, status: overColumn } : t
      )
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const originalStatus = dragStartStatusRef.current;
    setActiveId(null);
    dragStartStatusRef.current = null;

    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    if (TASK_STATUS_COLUMNS.includes(overId as TaskStatus)) {
      const targetStatus = overId as TaskStatus;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeTaskId ? { ...t, status: targetStatus } : t
        )
      );
      updateTaskAction(activeTaskId, { status: targetStatus })
        .then(() => { toast.success("Task updated"); })
        .catch((err) => { console.error(err); toast.error("Failed to update task"); });
      return;
    }

    const activeColumn = findColumn(activeTaskId);
    const overColumn = findColumn(overId);

    if (activeColumn && overColumn && activeColumn === overColumn) {
      setTasks((prev) => {
        const columnTasks = prev.filter((t) => t.status === activeColumn);
        const otherTasks = prev.filter((t) => t.status !== activeColumn);
        const oldIndex = columnTasks.findIndex((t) => t.id === activeTaskId);
        const newIndex = columnTasks.findIndex((t) => t.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reordered = arrayMove(columnTasks, oldIndex, newIndex);
        return [...otherTasks, ...reordered];
      });
    }

    // Persist status change if column changed during drag (handleDragOver moved it)
    const finalStatus = findColumn(activeTaskId);
    if (finalStatus && originalStatus && finalStatus !== originalStatus) {
      updateTaskAction(activeTaskId, { status: finalStatus })
        .then(() => { toast.success("Task updated"); })
        .catch((err) => { console.error(err); toast.error("Failed to update task"); });
    }
  }

  // CRUD handlers
  function handleAddTask(task: Task) {
    // Optimistic UI update
    setTasks((prev) => [task, ...prev]);
    setShowAddModal(false);
    setAddModalDefaultStatus(undefined);

    // Persist to DB
    createTaskAction({
      title: task.title,
      description: task.description || undefined,
      status: task.status,
      priority: task.priority,
      assigneeIds: task.assignees
        .map((name) => userNameToId[name])
        .filter(Boolean),
      dueDate: task.dueDate || undefined,
      projectId: task.projectId || undefined,
      engagementId: task.engagementId || undefined,
    })
      .then((dbTask) => {
        // Replace optimistic task with real DB task (to get real UUID)
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, id: dbTask.id } : t))
        );
        toast.success("Task created");
      })
      .catch((err) => {
        console.error(err);
        // Revert optimistic update on failure
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        toast.error("Failed to create task");
      });
  }

  function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );

    // Persist to DB — map UI fields to server action fields
    const serverUpdates: Parameters<typeof updateTaskAction>[1] = {};
    if (updates.title !== undefined) serverUpdates.title = updates.title;
    if (updates.description !== undefined) serverUpdates.description = updates.description;
    if (updates.status !== undefined) serverUpdates.status = updates.status;
    if (updates.priority !== undefined) serverUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) serverUpdates.dueDate = updates.dueDate;
    if (updates.assignees !== undefined) {
      serverUpdates.assigneeIds = updates.assignees
        .map((name) => userNameToId[name])
        .filter(Boolean);
    }
    if ("projectId" in updates) serverUpdates.projectId = updates.projectId;
    if ("engagementId" in updates) serverUpdates.engagementId = updates.engagementId;

    if (Object.keys(serverUpdates).length > 0) {
      updateTaskAction(taskId, serverUpdates)
        .then(() => { toast.success("Task updated"); })
        .catch((err) => { console.error(err); toast.error("Failed to update task"); });
    }
  }

  function handleDeleteTask(taskId: string) {
    // Optimistic UI update
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskId(null);

    // Persist to DB
    deleteTaskAction(taskId)
      .then(() => { toast.success("Task deleted"); })
      .catch((err) => {
        console.error(err);
        // Revert on failure
        setTasks(previousTasks);
        toast.error("Failed to delete task");
      });
  }

  function handleOpenAddModal(defaultStatus?: TaskStatus) {
    setAddModalDefaultStatus(defaultStatus);
    setShowAddModal(true);
  }

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId)
    : undefined;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TaskFilters
            assigneeFilter={assigneeFilter}
            onAssigneeChange={setAssigneeFilter}
            priorityFilter={priorityFilter}
            onPriorityChange={setPriorityFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-1.5 rounded-lg bg-[#111] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#333]"
          >
            <Plus size={14} strokeWidth={2} />
            Add Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2">
        <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-4">
          {TASK_STATUS_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={sortedTasksByColumn[status]}
              onCardClick={(task) => setSelectedTaskId(task.id)}
              onAddTask={handleOpenAddModal}
              projectNameMap={projectNameMap}
              clientNameMap={clientNameMap}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="w-[280px]">
              <TaskCard task={activeTask} onClick={() => {}} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
        </div>
      </DndContext>

      {/* Add Task Modal */}
      {showAddModal && (
        <AddTaskModal
          defaultStatus={addModalDefaultStatus}
          defaultProjectId={defaultProjectId}
          onClose={() => {
            setShowAddModal(false);
            setAddModalDefaultStatus(undefined);
          }}
          onSubmit={handleAddTask}
          projects={projects}
          clients={clients}
        />
      )}

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          projects={projects}
          clients={clients}
        />
      )}
    </div>
  );
}
