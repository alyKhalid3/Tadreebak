// Phase 2 task priority helpers. Extracted from tasks.service.ts so
// the in-memory rank and the MongoDB $addFields stage stay in sync
// (both use the same `PRIORITY_RANK` mapping).
//
// Why a hand-rolled rank instead of a string sort? String-sorting the
// priority enum would put "high" AFTER "low" alphabetically. The kanban
// needs high → medium → low, so we map to numbers 0, 1, 2 and sort by
// the number. Aggregation uses a $switch that mirrors the same ranks
// so the DB can do a globally-correct sort across pages.

import { TaskPriority } from "../DB/types/task.type"

export const PRIORITY_RANK: Record<TaskPriority, number> = {
    [TaskPriority.HIGH]: 0,
    [TaskPriority.MEDIUM]: 1,
    [TaskPriority.LOW]: 2,
}

// Returns a numeric rank for a priority value, with a high fallback
// for unknown values so they always end up at the end.
export const priorityRank = (priority: string | undefined | null): number => {
    if (!priority) return 9
    return PRIORITY_RANK[priority as TaskPriority] ?? 9
}

// MongoDB $switch branches for the aggregation. Keep in sync with
// PRIORITY_RANK — used in the priority-sort $addFields stage.
export const prioritySwitchBranches = () => [
    { case: { $eq: ["$priority", TaskPriority.HIGH] }, then: PRIORITY_RANK[TaskPriority.HIGH] },
    { case: { $eq: ["$priority", TaskPriority.MEDIUM] }, then: PRIORITY_RANK[TaskPriority.MEDIUM] },
    { case: { $eq: ["$priority", TaskPriority.LOW] }, then: PRIORITY_RANK[TaskPriority.LOW] },
]
