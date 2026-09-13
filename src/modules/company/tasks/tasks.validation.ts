// Validation schemas for the Task module.
//
// `createTaskSchema` is a discriminated union on the `target` field
// (Phase 6 — broadcast tasks):
//   - target: 'company'  → fan out to every active intern at this company
//   - target: 'program'  → fan out to every intern in `programId`
//   - target: 'project'  → fan out to every intern in `projectId`
//   - target: 'intern'   → single recipient (`internId` required)
//
// In every case the admin provides the same task metadata (title,
// description, priority, tags, due date, optional attachments). The
// service resolves the target to a member list and creates one
// task row per member, all sharing the same `taskGroupId`.
//
// The intern-side `submitTaskSchema` and the bulk update / group
// list schemas live here too.
import { z } from "zod"
import { TaskPriority, TaskStatus } from "../../../DB/types/task.type"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

// Tags are free-form labels. Lowercased and trimmed at the service
// layer so search/filter stays consistent. The schema limits each
// tag to 32 chars and the whole array to 20 entries — well above any
// realistic kanban use.
const tag = z.string().trim().min(1).max(32)

const attachment = z.object({
    public_id: z.string(),
    secure_url: z.string().url(),
    name: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(127),
    size: z.coerce.number().int().min(0).max(10 * 1024 * 1024), // 10 MB cap per file
})

// Shared metadata for every create mode.
const taskMeta = {
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().min(1).max(5000),
    priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
    tags: z.array(tag).max(20).default([]),
    dueDate: z.coerce.date(),
    // Attachments come from multipart "files" field. The service uploads
    // them to Cloudinary and stores the result here. Optional so the
    // admin can create a task without files in the first request, then
    // POST a follow-up /attachments call to add them.
    attachments: z.array(attachment).max(10).optional(),
}

// Phase 6: broadcast creation modes. The shape is identical except
// for the target discriminator and the required id field for that
// target. projectId/programId stay optional on every variant —
// they're context, not the broadcast target.
export const createTaskSchema = z.discriminatedUnion("target", [
    z.object({
        target: z.literal("company"),
        ...taskMeta,
        projectId: objectId.optional(),
        programId: objectId.optional(),
    }),
    z.object({
        target: z.literal("program"),
        programId: objectId,
        ...taskMeta,
        projectId: objectId.optional(),
    }),
    z.object({
        target: z.literal("project"),
        projectId: objectId,
        ...taskMeta,
        programId: objectId.optional(),
    }),
    z.object({
        target: z.literal("intern"),
        internId: objectId,
        ...taskMeta,
        projectId: objectId.optional(),
        programId: objectId.optional(),
    }),
])

export const updateTaskSchema = z.object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    tags: z.array(tag).max(20).optional(),
    dueDate: z.coerce.date().optional(),
    projectId: objectId.optional(),
    programId: objectId.optional(),
})

export const listTasksQuerySchema = z.object({
    internId: objectId.optional(),
    projectId: objectId.optional(),
    programId: objectId.optional(),
    // Phase 6: filter the kanban to a single broadcast.
    taskGroupId: objectId.optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    tag: z.string().trim().min(1).max(32).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sort: z
        .enum(["recent", "dueDate", "priority", "title"])
        .default("dueDate"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const taskIdParamSchema = z.object({
    taskId: objectId,
})

// Phase 6: bulk update every task in a broadcast (PATCH). The
// companyId is in the path; the groupId is in the path. Allowed
// fields are the same as `updateTaskSchema` minus projectId/programId
// (those are part of the broadcast's identity — you don't retag a
// broadcast to a different program/project after the fact).
export const bulkUpdateTaskSchema = z
    .object({
        title: z.string().trim().min(2).max(200).optional(),
        description: z.string().trim().min(1).max(5000).optional(),
        priority: z.nativeEnum(TaskPriority).optional(),
        tags: z.array(tag).max(20).optional(),
        dueDate: z.coerce.date().optional(),
    })
    .refine(
        (u) => Object.keys(u).length > 0,
        { message: "At least one field is required" },
    )

// 24-char ObjectId for the :groupId path param on the broadcast
// bulk endpoints.
export const taskGroupIdParamSchema = z.object({
    groupId: objectId,
})

// The state machine transition endpoint. Body carries the new status
// and optional reviewer feedback / points (admin only). The service
// validates the transition is legal.
export const transitionTaskSchema = z.object({
    to: z.nativeEnum(TaskStatus),
    reviewerFeedback: z.string().trim().min(1).max(2000).optional(),
    pointsAwarded: z.coerce.number().int().min(0).max(10000).optional(),
})

export const feedbackTaskSchema = z.object({
    reviewerFeedback: z.string().trim().min(1).max(2000),
})

// Intern-side "submit for review" carries an optional note (e.g. "fixed
// the off-by-one in pricing").
export const submitTaskSchema = z.object({
    note: z.string().trim().min(1).max(2000).optional(),
})
