// Phase 1 — Programs company-side controller.
//
// A Program = a cohort / batch of interns at a company (distinct from
// an Internship, which is a single job posting). One Program can span
// multiple Internships; interns are enrolled at the Program level.
//
// Mounted at /company/:companyId/programs. All routes require auth +
// COMPANY_OWNER + the company-ownership check inside the service.

import { Router } from "express"
import { ProgramsService } from "./programs.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as ProgramsValidation from "./programs.validation"

const programsService = new ProgramsService()

// Company-scoped router — mounted at /company/:companyId/programs
// Inherits :companyId via mergeParams.
const programsRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/programs:
 *   get:
 *     summary: List programs for a company
 *     description: |
 *       Returns every program owned by this company, newest
 *       `startDate` first. Filter by `status` to scope to one bucket
 *       (`upcoming` / `active` / `completed` / `archived`).
 *
 *       **Caching:** 60s under `programs:list:{companyId}:{queryHash}`.
 *       Busted on every create / update / archive / enroll / unenroll
 *       via the `programs:{companyId}` prefix flush.
 *
 *       **Pagination:** `page` (1-based, default 1) + `limit` (default
 *       20, max 100).
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [upcoming, active, completed, archived] }
 *         description: Optional status filter
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Programs fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListProgramsResponse'
 *       400: { description: Validation error (bad query) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
programsRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.listProgramsQuerySchema, "query"),
    programsService.list,
)

/**
 * @swagger
 * /company/{companyId}/programs:
 *   post:
 *     summary: Create a new program (cohort)
 *     description: |
 *       Creates a `Program` with `status: upcoming` and an empty
 *       `internIds[]`. Interns are added later via
 *       `POST /programs/:programId/interns`. To activate the program,
 *       update `status: active` (or just wait — admin moves it to
 *       `active` when the start date arrives).
 *
 *       **Fields you type:** `name`, `description?`, `startDate`,
 *       `endDate?`, `maxInterns?`, `coverImage?`.
 *       **Fields the service sets:** `companyId`, `internIds: []`,
 *       `status: upcoming`.
 *
 *       **Caching:** busts `programs:{companyId}` (prefix).
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProgram'
 *     responses:
 *       201:
 *         description: Program created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProgramEnvelope'
 *       400: { description: Validation error (bad name, missing startDate) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
programsRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.createProgramSchema),
    programsService.create,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   get:
 *     summary: Get a single program by id
 *     description: |
 *       Scoped to `companyId` so a company owner cannot read another
 *       company's program. Returns 404 if the program exists but
 *       belongs to a different company.
 *
 *       **Caching:** 60s under `programs:detail:{programId}`.
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Program fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProgramEnvelope'
 *       400: { description: Malformed programId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program not found at this company }
 */
programsRouter.get(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    programsService.detail,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   patch:
 *     summary: Update a program
 *     description: |
 *       Edit any subset of the mutable fields: `name`, `description`,
 *       `status`, `startDate`, `endDate`, `maxInterns`, `coverImage`.
 *       The body is spread into the update — empty patches are
 *       rejected by Zod refine "at least one field".
 *
 *       **`internIds[]` is NOT mutable** via this endpoint. Use
 *       `POST /:programId/interns` (enroll) or `DELETE
 *       /:programId/interns/:internId` (unenroll) instead.
 *
 *       **Cache flush:** `programs:detail:{programId}` +
 *       `programs:list:{companyId}` (prefix).
 *
 *       **No notification** is fired on update.
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProgram'
 *     responses:
 *       200:
 *         description: Program updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProgramEnvelope'
 *       400: { description: Validation error (bad field, empty body) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program not found at this company }
 */
programsRouter.patch(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    validation(ProgramsValidation.updateProgramSchema),
    programsService.update,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   delete:
 *     summary: Archive a program (soft delete + cascade)
 *     description: |
 *       Marks the program as `status: archived` (soft delete —
 *       reversible by PATCH with `status: active`).
 *
 *       **Soft-cascade:** every project where `programId` points at
 *       this program AND `status != archived` is also archived in
 *       the same call (one `updateMany` on `ProjectModel`).
 *
 *       **Tasks are NOT touched** — the admin can archive those
 *       separately if needed. This was the explicit decision in
 *       the design Q&A: soft-cascade goes Program → Projects, not
 *       Program → Tasks.
 *
 *       **Idempotent:** if the program is already archived, returns
 *       200 with "Program already archived" and skips the cascade.
 *
 *       **Cache flush:** `programs:detail:{programId}` +
 *       `programs:list:{companyId}` + `projects:{companyId}` (prefix
 *       for the cascaded project archive).
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Program archived (or was already archived)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Program archived successfully' }
 *                 cascadedProjects: { type: integer, description: 'Count of projects moved to archived in the same call' }
 *       400: { description: Malformed programId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program not found at this company }
 */
programsRouter.delete(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    programsService.archive,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}/interns:
 *   post:
 *     summary: Bulk-enroll interns into a program
 *     description: |
 *       Adds up to 200 interns to the program's `internIds[]` in one
 *       call. De-dupes against the existing list (so re-running the
 *       same payload is safe — already-enrolled interns are reported
 *       in the `skipped` count, not rejected).
 *
 *       **Does NOT create an `enrollments[]` row** on the user doc —
 *       this is the program's roster. The actual company enrollment
 *       (Phase 5 multi-company) is created by accepting the student's
 *       application via `PATCH /application/:id/status`.
 *
 *       **Constraint:** `maxInterns` is enforced as a soft cap — the
 *       service accepts over-enrollment but logs a warning. Hard cap
 *       is up to the admin's discipline.
 *
 *       **Cache flush:** `programs:detail:{programId}` +
 *       `programs:list:{companyId}` (prefix).
 *
 *       **Notification:** none — this is admin-only roster management.
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [internIds]
 *             properties:
 *               internIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 200
 *                 items: { type: string, description: 24-char ObjectId }
 *     responses:
 *       200:
 *         description: Enrolled (or already-enrolled skipped)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Enrolled 3 intern(s) (1 already in program)' }
 *                 program: { $ref: '#/components/schemas/Program' }
 *                 added: { type: integer, example: 3 }
 *                 skipped: { type: integer, example: 1 }
 *       400: { description: "Validation error (empty array, > 200, bad ObjectIds)" }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program not found at this company }
 */
programsRouter.post(
    "/:programId/interns",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    validation(ProgramsValidation.enrollInternsSchema),
    programsService.enrollInterns,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}/interns/{internId}:
 *   delete:
 *     summary: Unenroll a single intern from a program
 *     description: |
 *       Removes `internId` from the program's `internIds[]` via `$pull`.
 *       Idempotent — calling on an intern who's not enrolled is a no-op
 *       (the program is still returned, just unchanged).
 *
 *       **Does NOT revoke the company enrollment.** The intern's
 *       `user.enrollments[]` row at this company is untouched — to
 *       fully offboard an intern, use the dedicated withdrawal flow
 *       (out of scope for the program module).
 *
 *       **Cache flush:** `programs:detail:{programId}` +
 *       `programs:list:{companyId}` (prefix).
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: internId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Intern unenrolled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Intern unenrolled from program' }
 *                 program: { $ref: '#/components/schemas/Program' }
 *       400: { description: Malformed programId or internId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program not found at this company }
 */
programsRouter.delete(
    "/:programId/interns/:internId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.unenrollInternSchema, "params"),
    programsService.unenrollIntern,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     Program:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, minLength: 2, maxLength: 100 }
 *         description: { type: string, maxLength: 2000, nullable: true }
 *         companyId: { type: string, description: 24-char ObjectId }
 *         status: { type: string, enum: [upcoming, active, completed, archived] }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         internIds:
 *           type: array
 *           items: { type: string }
 *           description: Roster of user ObjectIds in this program
 *         coverImage:
 *           type: object
 *           nullable: true
 *           properties:
 *             public_id: { type: string }
 *             secure_url: { type: string }
 *         maxInterns: { type: integer, minimum: 1, maximum: 1000, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CreateProgram:
 *       type: object
 *       required: [name, startDate]
 *       properties:
 *         name: { type: string, minLength: 2, maxLength: 100 }
 *         description: { type: string, maxLength: 2000 }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         maxInterns: { type: integer, minimum: 1, maximum: 1000 }
 *         coverImage:
 *           type: object
 *           properties:
 *             public_id: { type: string }
 *             secure_url: { type: string, format: uri }
 *
 *     UpdateProgram:
 *       type: object
 *       minProperties: 1
 *       description: 'Empty body rejected by Zod. `internIds[]` is NOT mutable here.'
 *       properties:
 *         name: { type: string, minLength: 2, maxLength: 100 }
 *         description: { type: string, maxLength: 2000 }
 *         status: { type: string, enum: [upcoming, active, completed, archived] }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         maxInterns: { type: integer, minimum: 1, maximum: 1000 }
 *         coverImage:
 *           type: object
 *           properties:
 *             public_id: { type: string }
 *             secure_url: { type: string, format: uri }
 *
 *     ProgramEnvelope:
 *       type: object
 *       properties:
 *         program: { $ref: '#/components/schemas/Program' }
 *
 *     ListProgramsResponse:
 *       type: object
 *       properties:
 *         programs:
 *           type: array
 *           items: { $ref: '#/components/schemas/Program' }
 *         pagination: { $ref: '#/components/schemas/Pagination' }
 */

export { programsRouter }
