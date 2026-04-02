import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 10;

//Hashing a password
export const hashPassword = async (password: string): Promise<string> => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

//Compare the password with hash
export const comparePassword = async (
    password: string,
    hash: string
): Promise<boolean> => {
    return await bcrypt.compare(password, hash);
};

//Generating JWT token
export const generateToken = (user: User): string => {
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

//Verify JWT tokem
export const verifyToken = (token: string): any => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};