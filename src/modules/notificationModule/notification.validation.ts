import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
    unreadOnly: z.string().optional(),   // "true" / "false"
    page: z.string().optional(),
    limit: z.string().optional(),
})
