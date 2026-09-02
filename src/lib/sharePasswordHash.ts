import bcrypt from "bcryptjs";

export async function hashSharePassword(password: string) { return bcrypt.hash(password, 10); }
export async function verifySharePassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
