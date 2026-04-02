//Logic for Registration and Login

import { Request, Response } from 'express';
import db from '../config/database';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { User, UserRegistration, UserLogin, AuthResponse } from '../models/types';

//Registering a new user

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password, role = 'counter' }: UserRegistration = req.body;
    
        //validate input
        if (!username || !email || !password) {
            res.status(400).json({ error: 'Username, email, and password are required' });
            return;
        }

        const existingUser = await db.oneOrNone(
            'SELECT * FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        
        if (existingUser) {
            res.status(400).json({ error: 'Username or email already exists'});
            return;
        }

        //hashing the password
        const password_hash = await hashPassword(password);

        //insert new user to database
        const newUser = await db.one<User>(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
            [username, email, password_hash, role]
        );

        //Generate JWT token
        const token = generateToken(newUser);

        //send response
        const response: AuthResponse = {
            token, 
            user: newUser,
        };

        res.status(201).json(response);
        }   catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Internal Server Error'});
    }
    };

    //Login existing user
        export const login = async (req: Request, res: Response): Promise<void> => {
            try {
             const { username, password }: UserLogin = req.body;
            
             //validate username & password
                if (!username || !password) {
                    res.status(400).json({ error: 'Username and password are required'})
                    return;
                }
    

            //Find user in a database
                const user = await db.oneOrNone<User & { password_hash: string }>(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );

            //Check if user exists 
             if (!user) {
                res.status(401).json({ error: 'Invalid user'})
                return;
             }

             //comparing password 
             const isMatch = await comparePassword(password, user.password_hash);

            if (!isMatch) {
                res.status(401).json({ error: 'Invalid password'})
                return;
             }

             //Remove password hash from user object before sending it
             const { password_hash, ...userWithoutPassword } = user;

             //Generate token
             const token = generateToken(userWithoutPassword as User);

             //Send response 
                const response: AuthResponse = {
                    token,
                    user: userWithoutPassword as User, 
            };

            res.status(200).json(response);
        }   catch (error) { 
            console.error('Login Error:', error);
            res.status(500).json({ error: 'Internal Server Error'});
        }
    };