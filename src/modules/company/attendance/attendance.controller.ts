// Phase 7 — company-side attendance controller.
//
//   - GET    /company/{companyId}/attendance                          (list rows)
//   - POST   /company/{companyId}/interns/{internId}/attendance       (mark one row)
//
//   Schedule (the "required days" table):
//   - GET    /company/{companyId}/attendance/schedule?programId=      (read)
//   - PUT    /company/{companyId}/attendance/schedule                 (upsert)
//
// The schedule is per-(companyId, programId). Omit programId to
// read/write the company default. PUT upserts: re-sending the
// same payload replaces the existing schedule. The admin is the
// source of truth for both the schedule and the per-row status
// (the intern-side check-in was removed in Phase 7).

import { Router } from "express"
import { AttendanceService } from "./attendance.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as AttendanceValidation from "./attendance.validation"

const attendanceService = new AttendanceService()

const attendanceRouter = Router({ mergeParams: true })

attendanceRouter.use(auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]))

/**
 * @swagger
 * /company/{companyId}/attendance:
 *   get:
 *     summary: "List attendance rows (defaults to the last 30 days in the company timezone)"
 *     description: |
 *       Returns the admin's view of the intern attendance. The default
 *       date range is the **last 30 days** measured in the company's
 *       timezone (falls back to UTC when `company.timezone` is unset).
 *     tags: [Dashboard - Attendance]
 *     security:
 *       - bearerAuth: []
 */
attendanceRouter.get(
    "/",
    validation(AttendanceValidation.listAttendanceQuerySchema, "query"),
    attendanceService.list,
)

/**
 * @swagger
 * /company/{companyId}/attendance/bulk-mark:
 *   post:
 *     summary: Bulk-mark multiple attendance rows in one round-trip
 *     description: |
 *       Upserts N attendance rows in a single call. Each row is
 *       `(internId, date, status, note?)`. Per-row business checks
 *       (active enrollment, 7-day window, intern exists) are
 *       **best-effort** — failed rows go into `skipped[]` in the
 *       response with a `reason` string instead of failing the
 *       whole batch. Successful rows go into `marked[]`.
 *
 *       Capped at **500 rows per call** as a sanity limit. For
 *       larger imports, paginate the client-side.
 *
 *       The intern-side check-in was removed in Phase 7 — the
 *       admin is the source of truth. Use this endpoint to do an
 *       end-of-week "mark everyone missed today" batch.
 *     tags: [Dashboard - Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkMarkAttendance'
 *     responses:
 *       200: { description: Bulk mark complete (with per-row summary) }
 *       400: { description: "Validation error (empty rows, > 500 rows, malformed ids/dates/statuses)" }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
attendanceRouter.post(
    "/bulk-mark",
    validation(AttendanceValidation.bulkMarkAttendanceSchema),
    attendanceService.bulkMark,
)

/**
 * @swagger
 * /company/{companyId}/interns/{internId}/attendance:
 *   post:
 *     summary: Manually mark or override an attendance row
 *     description: |
 *       Admin override for the daily attendance. Upserts on
 *       `(internId, date)` — a second call with the same date
 *       overwrites the status (and note) instead of creating a
 *       second row. Date must be within the last 7 days, measured
 *       in the **company's timezone**.
 *
 *       For marking N rows at once, prefer
 *       `POST /attendance/bulk-mark` (one round-trip).
 *
 *       Statuses: `attended` | `missed` | `late` | `excused`. The
 *       intern-side check-in was removed — the admin is the source
 *       of truth.
 *     tags: [Dashboard - Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MarkAttendance'
 *     responses:
 *       200: { description: Attendance marked or upserted }
 *       400: { description: Invalid intern id, missing fields, or date outside 7-day window }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Intern not found at this company }
 */
attendanceRouter.post(
    "/interns/:internId/attendance",
    validation(AttendanceValidation.attendanceInternParamSchema, "params"),
    validation(AttendanceValidation.markAttendanceSchema),
    attendanceService.mark,
)

// ============================================================
// Schedule (Phase 7 — the "required days" table)
// ============================================================

/**
 * @swagger
 * /company/{companyId}/attendance/schedule:
 *   get:
 *     summary: Fetch the attendance schedule (the required-days table)
 *     description: |
 *       Returns the schedule for `(companyId, programId?)`. When
 *       `programId` is omitted the company default is returned.
 *       The response includes the weekly pattern (`sunday`..
 *       `saturday`), optional `effectiveFrom`/`effectiveTo` date
 *       range, and the program's ObjectId (or null for the default).
 *
 *       If no schedule exists at that scope yet, `schedule` is
 *       `null` and the message is "No schedule configured for this
 *       scope yet".
 *     tags: [Dashboard - Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programId
 *         schema: { type: string }
 *         required: false
 *         description: 24-char ObjectId. Omit for the company default.
 *     responses:
 *       200: { description: Schedule (or null) }
 *       400: { description: Malformed programId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: programId not found at this company }
 */
attendanceRouter.get(
    "/schedule",
    validation(AttendanceValidation.getAttendanceScheduleQuerySchema, "query"),
    attendanceService.getSchedule,
)

/**
 * @swagger
 * /company/{companyId}/attendance/schedule:
 *   put:
 *     summary: Upsert the attendance schedule (the required-days table)
 *     description: |
 *       Creates or replaces the schedule for
 *       `(companyId, programId?)`. The `programId` in the body is
 *       optional — omit it to write the company default.
 *
 *       Body: `{ weeklyPattern, programId?, effectiveFrom?,
 *       effectiveTo? }`. `weeklyPattern` must have at least one
 *       day set to `true` (the schema enforces this with a clear
 *       400). `effectiveFrom`/`effectiveTo` are an optional
 *       YYYY-MM-DD range; `effectiveTo: null` means open-ended.
 *
 *       Re-sending the same payload replaces the existing
 *       schedule. There is no DELETE — to clear a schedule
 *       entirely, send an empty `weeklyPattern` would be rejected
 *       (validation), so the admin would have to set every day to
 *       `false` AND drop the schedule row via a one-off script. For
 *       the common case of "swap the schedule", just PUT the new
 *       one.
 *     tags: [Dashboard - Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpsertAttendanceSchedule'
 *     responses:
 *       200: { description: Schedule saved (created or updated) }
 *       400: { description: Validation error (e.g. empty weeklyPattern) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: programId not found at this company }
 */
attendanceRouter.put(
    "/schedule",
    validation(AttendanceValidation.upsertAttendanceScheduleSchema),
    attendanceService.upsertSchedule,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     MarkAttendance:
 *       type: object
 *       required: [date, status]
 *       properties:
 *         date: { type: string, description: 'YYYY-MM-DD, in the company timezone' }
 *         status:
 *           type: string
 *           enum: [attended, missed, late, excused]
 *         note: { type: string, maxLength: 500 }
 *     BulkMarkAttendance:
 *       type: object
 *       required: [rows]
 *       properties:
 *         rows:
 *           type: array
 *           minItems: 1
 *           maxItems: 500
 *           items:
 *             type: object
 *             required: [internId, date, status]
 *             properties:
 *               internId: { type: string, description: 24-char ObjectId }
 *               date: { type: string, description: 'YYYY-MM-DD, in the company timezone' }
 *               status:
 *                 type: string
 *                 enum: [attended, missed, late, excused]
 *               note: { type: string, maxLength: 500 }
 *     BulkMarkAttendanceResponse:
 *       type: object
 *       properties:
 *         marked:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               internId: { type: string }
 *               date: { type: string }
 *               status: { type: string }
 *         skipped:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               internId: { type: string }
 *               date: { type: string }
 *               reason:
 *                 type: string
 *                 enum:
 *                   - Intern not found
 *                   - Not actively enrolled at this company
 *                   - Date more than 7 days in the past
 *         totals:
 *           type: object
 *           properties:
 *             requested: { type: integer }
 *             marked: { type: integer }
 *             skipped: { type: integer }
 *     UpsertAttendanceSchedule:
 *       type: object
 *       required: [weeklyPattern]
 *       properties:
 *         programId:
 *           type: string
 *           description: 24-char ObjectId. Omit for the company default.
 *         weeklyPattern:
 *           type: object
 *           description: |
 *             Day-of-week booleans. At least one must be `true` —
 *             a schedule with zero required days is rejected at
 *             the schema layer.
 *           required: [sunday, monday, tuesday, wednesday, thursday, friday, saturday]
 *           properties:
 *             sunday:    { type: boolean }
 *             monday:    { type: boolean }
 *             tuesday:   { type: boolean }
 *             wednesday: { type: boolean }
 *             thursday:  { type: boolean }
 *             friday:    { type: boolean }
 *             saturday:  { type: boolean }
 *         effectiveFrom: { type: string, description: 'YYYY-MM-DD, inclusive' }
 *         effectiveTo:   { type: string, nullable: true, description: 'YYYY-MM-DD inclusive; null = open-ended' }
 */

export { attendanceRouter }
