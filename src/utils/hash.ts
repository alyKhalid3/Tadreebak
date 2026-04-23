import bcrypt from "bcrypt";

export const createHash = async ({text}: {text: string}): Promise<string> => {
    const saltRounds = process.env.SALT_ROUNDS ? parseInt(process.env.SALT_ROUNDS) : 10;
    return await bcrypt.hash(text, saltRounds);
}


export const compareHash = async ({text, hashed}: {text: string, hashed: string}): Promise<boolean> => {
    const data=await bcrypt.compare(text, hashed)
    return data
}