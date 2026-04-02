import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { User } from '../models/types';

//extending Express request to include the user
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    try {
        // Getting token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ message: 'No token provided' });
            return;
        }

        const token = authHeader.split(' ')[1];

        //Verifying token
        const decoded = verifyToken(token);

        if (!decoded) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        // Attaching user info to request object

        req.user = decoded as User;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Authentication failed' });

    }
};