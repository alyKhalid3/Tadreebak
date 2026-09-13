// Task state machine — extracted from tasks.service.ts and
// internTasks.service.ts so the rules can be unit-tested without
// spinning up a database.
//
// Two actor roles use it:
//   - "admin"   — the company owner, who can do every legal transition
//   - "intern"  — the assignee, who can only start (todo → in_progress)
//                 and submit (in_progress → in_review). Admins can also
//                 send a task back from review to in_progress.
//
// Soft-delete (`archived`) is a separate endpoint, not a transition.
// `complete` is terminal — to "uncomplete" a task, archive it and
// create a new one.
//
// The two helpers `canTransition(role, from, to)` and
// `nextStates(role, from)` are the only API the rest of the codebase
// needs. Interns should use `nextStates('intern', task.status)` to
// decide which buttons to render; admins get the full set.

import { TaskStatus } from "../DB/types/task.type"

export type TaskActorRole = 'admin' | 'intern'

// Admin's full table. The intern's is the strict subset below.
const ADMIN_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETE],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.COMPLETE],
    [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETE],
    [TaskStatus.COMPLETE]: [],
    [TaskStatus.ARCHIVED]: [],
}

// Intern can only do the two "forward" actions: start, submit. They
// can't approve (that's admin's `in_review → complete`), and they
// can't move directly to complete. The "send back" transition
// (`in_review → in_progress`) is also admin-only.
const INTERN_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW],
    [TaskStatus.IN_REVIEW]: [],
    [TaskStatus.COMPLETE]: [],
    [TaskStatus.ARCHIVED]: [],
}

const TABLE: Record<TaskActorRole, Record<TaskStatus, TaskStatus[]>> = {
    admin: ADMIN_TRANSITIONS,
    intern: INTERN_TRANSITIONS,
}

// Is `from → to` a legal transition for the given role?
export const canTransition = (
    role: TaskActorRole,
    from: TaskStatus,
    to: TaskStatus,
): boolean => {
    const allowed = TABLE[role]?.[from] ?? []
    return allowed.includes(to)
}

// What states can this role move a task of `from` into?
// Used by the frontend to render the right action buttons.
export const nextStates = (
    role: TaskActorRole,
    from: TaskStatus,
): TaskStatus[] => {
    return TABLE[role]?.[from] ?? []
}

// Is the task in a terminal state (no outgoing transitions for ANY role)?
// Archived and complete are both terminal.
export const isTerminal = (from: TaskStatus): boolean => {
    return (
        ADMIN_TRANSITIONS[from]?.length === 0 &&
        INTERN_TRANSITIONS[from]?.length === 0
    )
}
