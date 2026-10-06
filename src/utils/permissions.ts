// Phase 18B / Permissions registry.
//
// Every action the staff side of a company dashboard can perform
// maps to a permission string. The role definition (CompanyRole)
// stores an array of these strings, and `assertStaffPermission`
// checks the array for the specific permission a route requires.
//
// Why a hardcoded registry and not a free-form string the front-end
// can mint?
//   - Each permission has to map to a specific route gate. If the
//     front-end could grant `magic.unicorn`, the gate wouldn't know
//     what to check.
//   - The registry is the source of truth for "what's possible" —
//     the front-end can read it via `GET /permissions` to render
//     the permission picker without hardcoding the keys.
//   - Adding a new permission is a 1-line change in code + a route
//     gate, not a config drift risk.
//
// Adding a new permission: add it here, then thread it through the
// controller that should be guarded. The route-to-permission map
// lives in `docs/PHASE_18B_PERMISSIONS_AND_ROLES_PLAN.md`.

export const PERMISSIONS = {
    // Tasks (kanban)
    'tasks.read': 'Read tasks',
    'tasks.create': 'Create tasks',
    'tasks.update': 'Update tasks',
    'tasks.delete': 'Delete tasks',
    'tasks.archive': 'Archive tasks',

    // Attendance
    'attendance.read': 'Read attendance',
    'attendance.mark': 'Mark attendance (single + bulk)',
    'attendance.schedule': 'Edit the attendance schedule',

    // Evaluations
    'evaluations.read': 'Read evaluations',
    'evaluations.create': 'Create evaluations',
    'evaluations.share': 'Share / unshare evaluations',

    // Applicants (review applications for an internship)
    'applicants.read': 'Read applicants',
    'applicants.review': 'Accept / reject applicants',
    'applicants.send_acceptance_email': 'Send acceptance email',
    'applicants.mark_completed': 'Mark an applicant completed',

    // Interns roster
    'interns.read': 'Read the intern roster',

    // Projects (containers for tasks)
    'projects.read': 'Read projects',
    'projects.crud': 'Create / update / delete projects',

    // Roles (admin work — usually owner-only)
    'roles.read': 'List roles',
    'roles.create': 'Create a custom role',
    'roles.update': 'Update a custom role',
    'roles.delete': 'Delete a custom role',

    // Staff management (admin work — usually owner-only)
    'staff.invite': 'Invite a staff member',
    'staff.update': 'Rename / update a staff member',
    'staff.remove': 'Soft-revoke a staff member',
    'staff.resend_invite': 'Resend the setup email',
} as const satisfies Record<string, string>

export type PermissionKey = keyof typeof PERMISSIONS

// Set version for fast "is this a known permission" checks.
const PERMISSION_SET: ReadonlySet<string> = new Set(Object.keys(PERMISSIONS))

export const isKnownPermission = (key: string): key is PermissionKey =>
    PERMISSION_SET.has(key)

// Default permission set for the seeded "Instructor" role.
// Excludes the admin work (`staff.*`, `roles.*`) — same set
// the locked-in Phase 18 / 1+2 instructor had, just expressed
// as explicit permission strings now.
export const INSTRUCTOR_DEFAULT_PERMISSIONS: PermissionKey[] = [
    'tasks.read', 'tasks.create', 'tasks.update', 'tasks.delete', 'tasks.archive',
    'attendance.read', 'attendance.mark', 'attendance.schedule',
    'evaluations.read', 'evaluations.create', 'evaluations.share',
    'applicants.read', 'applicants.review', 'applicants.send_acceptance_email', 'applicants.mark_completed',
    'interns.read',
    'projects.read', 'projects.crud',
]

// The Owner role is a special case — its permissions are
// generated at seed time (every key in PERMISSIONS). The
// `isOwnerRole: true` flag bypasses the permission check
// entirely so the owner doesn't need to be re-issued when
// new permissions are added to the registry.
export const getAllPermissionKeys = (): PermissionKey[] =>
    Object.keys(PERMISSIONS) as PermissionKey[]

// Friendly shape for the `GET /permissions` endpoint. The
// front-end renders this as a checkbox list on the role-edit
// page.
export const listPermissionsForPicker = (): Array<{
    key: PermissionKey
    label: string
    group: string
}> => {
    const groups: Record<string, string> = {
        'Tasks': 'tasks',
        'Attendance': 'attendance',
        'Evaluations': 'evaluations',
        'Applicants': 'applicants',
        'Interns': 'interns',
        'Projects': 'projects',
        'Roles (admin)': 'roles',
        'Staff (admin)': 'staff',
    }
    return (Object.keys(PERMISSIONS) as PermissionKey[]).map((key) => {
        const group = Object.entries(groups).find(([, prefix]) => key.startsWith(`${prefix}.`))?.[0] ?? 'Other'
        return { key, label: PERMISSIONS[key], group }
    })
}