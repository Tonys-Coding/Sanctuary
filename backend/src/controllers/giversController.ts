import { Request, Response } from 'express';
import db from '../config/database';
import { Giver } from '../models/types';

//Get all givers

export const getAllGivers = async (req: Request, res: Response): Promise<void> => {
    try {
        const givers = await db.any<Giver>('SELECT * FROM givers ORDER BY name ASC');
        res.status(200).json(givers);
    }
    catch (error) {
        console.error('Error fetching givers:', error);
        res.status(500).json({ error: 'Failed to retrieve givers' });
    }
};

export const getGiverById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const giver = await db.oneOrNone<Giver>('SELECT * FROM givers WHERE id=$1', [id]);

        if (!giver) {
            res.status(404).json({ error: 'Giver not found' });
            return;
        }
        res.status(200).json(giver);
    }
    catch (error) {
        console.error('Error fetching giver by ID:', error);
        res.status(500).json({ error: 'Failed to retrieve giver' });
    }
};

export const createGiver = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, title, phone_number, email, address, notes, profile_picture } = req.body;
        const userId = req.user?.id; //auth middleware attaches user info to request
        
        //  Validation
        if (!name || !title) {
            res.status(400).json({ error: 'Name and title are required'});
            return;
        }

        const newGiver = await db.one<Giver>(
            'INSERT INTO givers(name, title, phone_number, email, address, notes, profile_picture, created_by) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [name, title, phone_number || null, email || null, address || null, notes || null, profile_picture || null, userId]
        );
        res.status(201).json(newGiver);
    }
    catch (error) {
        console.error('Error creating giver:', error);
        res.status(500).json({ error: 'Failed to create giver' });
    }
};

//Optional: A profile picture can be input for each giver, but it is not required. 
// If a profile picture is uploaded, the URL of the uploaded image will be stored in the database. 
// If no profile picture is provided, the profile_picture field will be set to null. 
// This allows for flexibility in managing givers who may not have a profile picture while still supporting those who do. 
// The system can handle both cases seamlessly without any issues.
export const uploadProfilePicture = async (req: Request, res: Response): Promise<void> => {
    try {
        const giverId = req.user?.id;

        if(!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        //URL path to uploaded file
        const profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;

        //Updates giver with new profile picture URL
        const updatedGiver = await db.one(
            `UPDATE givers SET profile_picture = $1 WHERE id = $2 RETURNING *`,
            [profilePictureUrl, giverId]
        );

        res.status(200).json(updatedGiver);
    }
    catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
   }
};

//Deleting the old profile picture file from the server when a new one is uploaded,
// or when a giver is deleted can be implemented as an enhancement to manage storage and keep the server clean.
export const deleteProfilePicture = async (req: Request, res: Response): Promise<void> => {

    try{
        const giverId = req.user?.id;

        //Remove picture from database
        const updateGiver = await db.one(
            `UPDATE givers SET profile_picture = NULL WHERE id = $1 RETURNING *`,
            [giverId]
        );

        //Note from Claude: In a production app, you would delete the file from disk storage here using fs.unlink,
        //  or a similar method, but for simplicity we are just removing the URL from the database.

        res.status(200).json(updateGiver);
    }
    catch (error) {
        console.error('Error deleting profile picture:', error);
        res.status(500).json({ error: 'Failed to delete profile picture' });
    }
};



//Updating a giver
export const updateGiver = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const {name, title, phone_number, email, address, notes, profile_picture} = req.body;

        // Validation
        if (!name || !title) {
            res.status(400).json({ error: 'Name and title are required' });
            return;
        }

        const updatedGiver = await db.oneOrNone<Giver>(
            'UPDATE givers SET name=$1, title=$2, phone_number=$3, email=$4, address=$5, notes=$6, profile_picture=$7 WHERE id=$8 RETURNING *',
            [name, title, phone_number || null, email || null, address || null, notes || null, profile_picture || null, id]
        );

        if (!updatedGiver) {
            res.status(404).json({ error: 'Giver not found' });
            return;
        }
        res.status(200).json(updatedGiver);
    }
    catch (error) {
        console.error('Error updating giver:', error);
        res.status(500).json({ error: 'Failed to update giver' });
    }
};

//Deleting a giver
export const deleteGiver = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const deletedGiver = await db.oneOrNone<Giver>(
            'DELETE FROM givers WHERE id=$1 RETURNING *',
            [id]
        );

        if (!deletedGiver) {
            res.status(404).json({ error: 'Giver not found' });
            return;
        }
        res.status(200).json({ message: 'Giver deleted succesfully' });
    }
    catch (error) {
        console.error('Error deleting giver:', error);
        res.status(500).json({ error: 'Failed to delete giver' });
    }
};