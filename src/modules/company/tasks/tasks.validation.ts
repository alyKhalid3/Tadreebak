// Validation schemas for the Task module. Mirrors the Phase 1 pattern
// (programs/projects): one schema per HTTP method, `objectId` regex
// helper for the path params, `source: "body"|"query"|"params"` on
// the validation middleware when the source isn't the body.
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

export const createTaskSchema = z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().min(1).max(5000),
    internId: objectId,
    projectId: objectId.optional(),
    programId: objectId.optional(),
    priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
    tags: z.array(tag).max(20).default([]),
    dueDate: z.coerce.date(),
    // Attachments come from multipart "files" field. The service uploads
    // them to Cloudinary and stores the result here. Optional so the
    // admin can create a task without files in the first request, then
    // POST a follow-up /attachments call to add them.
    attachments: z.array(attachment).max(10).optional(),
})

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
