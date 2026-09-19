// Phase 12 / P2 #5 — Save Companies.
//
// Mirrors the saved-internships pattern exactly:
//   - POST   /companies/:id/save   → idempotent save
//   - DELETE /companies/:id/save   → idempotent unsave
//   - GET    /companies/saved       → list the student's saved companies
//
// All three endpoints are scoped to the authenticated student via
// `res.locals.user`. Cross-student access is impossible because
// every query filters by `studentId = user._id`.
//
// The list endpoint caches under `companies:saved:{studentId}:{queryHash}`
// and the mutation endpoints flush that prefix on every change so
// toggling save / unsave is reflected on the next read.

import { NextFunction, Request, Response } from "express"
import mongoose, { isObjectIdOrHexString } from "mongoose"
import { SavedCompanyModel } from "../../DB/models/savedCompany.model"
import { companyModel } from "../../DB/models/company.model"
import { ApplicationError, NotFoundException } from "../../utils/error"
import { successHandler } from "../../utils/successHandler"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../cache/cache"

const SAVED_KEY = (studentId: string) => `companies:saved:${studentId}`

export class SavedCompaniesService {
    save = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id as string
            const user = res.locals.user
            if (!isObjectIdOrHexString(id)) {
                throw new ApplicationError('Invalid company id', 400)
            }

            // Verify the company exists (404 otherwise). We DON'T
            // gate on `approvedByAdmin` here — a student might
            // save a pending-approval company to come back later.
            const company = await companyModel.findById(id).select('_id').lean()
            if (!company) {
                throw new NotFoundException('Company not found')
            }

            // Idempotent — saving twice is not an error so the
            // frontend can freely toggle without showing a
            // confusing "already saved" toast.
            const existing = await SavedCompanyModel.findOne({
                studentId: user._id,
                companyId: new mongoose.Types.ObjectId(id),
            }).lean()
            if (!existing) {
                await SavedCompanyModel.create({
                    studentId: user._id,
                    companyId: new mongoose.Types.ObjectId(id),
                })
                // New bookmark — bust the saved-list cache so the
                // next list read includes the company. No need to
                // bust any other cache; the company profile
                // doesn't expose "saved by N users".
                await cacheFlushPrefix(SAVED_KEY(user._id.toString()))
            }

            return successHandler({ res, status: 201, message: 'Company saved' })
        } catch (error) {
            next(error)
        }
    }

    unsave = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id as string
            const user = res.locals.user
            if (!isObjectIdOrHexString(id)) {
                throw new ApplicationError('Invalid company id', 400)
            }

            // Idempotent — no-op when not previously saved. A
            // missing company on the unsave path is also a no-op
            // (we don't surface a 404) because the user-visible
            // state is "this company is no longer saved", and
            // that's true regardless of whether the row existed.
            await SavedCompanyModel.deleteMany({
                studentId: user._id,
                companyId: new mongoose.Types.ObjectId(id),
            })

            await cacheFlushPrefix(SAVED_KEY(user._id.toString()))

            return successHandler({ res, message: 'Company removed from saved' })
        } catch (error) {
            next(error)
        }
    }

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { page = '1', limit = '10' } = req.query as Record<string, string | undefined>

            const pageNum = Math.max(1, parseInt(page || '1', 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10)))
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `companies:saved:${user._id.toString()}:${JSON.stringify({ pageNum, limitNum })}`
            const data = await cacheWrap(cacheKey, 60, async () => {
                const [items, totalCount] = await Promise.all([
                    SavedCompanyModel.find({ studentId: user._id })
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limitNum)
                        // Populate the company doc so the frontend can
                        // render the card without a second round trip.
                        .populate({
                            path: 'companyId',
                            select: '-legalAttachment', // admin-only field
                        })
                        .lean(),
                    SavedCompanyModel.countDocuments({ studentId: user._id }),
                ])

                // Project the populated company doc up one level so the
                // response shape is `{ companies: [...] }` (mirrors the
                // saved-internships list response). Drop rows whose
                // company was deleted — they're orphaned bookmarks and
                // should not surface.
                const companies = items
                    .map((row: any) => row.companyId)
                    .filter((c: any) => c && typeof c === 'object')

                return {
                    companies,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limitNum),
                    },
                }
            })

            return successHandler({ res, message: 'ok', data })
        } catch (error) {
            next(error)
        }
    }
}
