import { Types } from "mongoose";

export interface ISavedInternship {
    studentId: Types.ObjectId;
    internshipId: Types.ObjectId;
}
