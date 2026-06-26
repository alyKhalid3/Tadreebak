import { isObjectIdOrHexString } from "mongoose";
import { CompanyRepo } from "../DB/repos/company.repo";
import { ICompany } from "../DB/types/company.type";
import { ApplicationError, NotFoundException } from "./error";

const companyRepo = new CompanyRepo()

/**
 * Verify that the given company exists, is active (not deleted/banned),
 * optionally approved, and is owned by the acting user. Returns the company
 * document so callers can use it. Shared by the intern & application services
 * to avoid duplicating the same ownership/status checks.
 *
 * @param requireApproval when true (default) the company must also be approved
 *   by an admin. Company creation flow passes false.
 */
export const assertOwnedCompany = async (
    companyId: string,
    userId: string,
    requireApproval = true,
): Promise<ICompany> => {
    if (!isObjectIdOrHexString(companyId)) {
        throw new ApplicationError("Invalid company id", 400)
    }
    const company = await companyRepo.findById({ id: companyId })
    if (!company || company.deletedAt || company.bannedAt) {
        throw new NotFoundException("Company not found")
    }
    if (requireApproval && !company.approvedByAdmin) {
        throw new NotFoundException("Company not found")
    }
    if (company.createdBy.toString() !== userId) {
        throw new ApplicationError("You are not the owner of this company", 403)
    }
    return company
}
