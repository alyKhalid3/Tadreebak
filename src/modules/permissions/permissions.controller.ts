// Phase 18B / Permissions registry endpoint.
//
// Public read-only endpoint — returns the full list of
// permission keys the gate knows about, grouped for the
// front-end's role-edit picker.
//
// Why public (no auth): the front-end needs to render the
// permission list on the role-edit page BEFORE the user is
// authenticated (or even if they're not). The keys themselves
// aren't sensitive — they only become meaningful when paired
// with a role definition. There are no secrets here.
import { Router } from "express"
import { listPermissionsForPicker } from "../../utils/permissions"
import { successHandler } from "../../utils/successHandler"

const router = Router()

/**
 * @swagger
 * /permissions:
 *   get:
 *     summary: List every permission key the backend knows about
 *     description: |
 *       Public, no auth required. Returns the registry of permission
 *       strings the backend can gate on, grouped by domain (tasks,
 *       attendance, evaluations, applicants, interns, projects,
 *       roles, staff). The front-end uses this to render the
 *       permission picker on the role-edit screen — no need to
 *       hardcode the keys client-side.
 *
 *       The list is built from `src/utils/permissions.ts` at
 *       server start; adding a new permission requires a code
 *       change (a one-line addition + a route gate).
 *     tags: [Permissions]
 *     responses:
 *       200:
 *         description: Permission list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: "tasks.create" }
 *                           label: { type: string, example: "Create tasks" }
 *                           group: { type: string, example: "Tasks" }
 *                 msg: { type: string }
 */
router.get('/', (_req, res) => {
    return successHandler({
        res,
        message: 'Permissions fetched',
        data: { permissions: listPermissionsForPicker() },
    })
})

export { router as permissionsRouter }