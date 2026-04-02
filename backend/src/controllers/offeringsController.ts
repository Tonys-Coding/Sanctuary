import { Request, Response } from 'express';
import db from '../config/database'
import { Offering } from '../models/types';

//Get all offerings (optional filters)
export const getAllOfferings = async (req: Request, res: Response): Promise<void> => {
    try {
        const { giver_id, method, start_date, end_date } = req.query;

        let query = `SELECT * FROM offerings WHERE 1=1`;
        const params: any[] = [];
        let paramCount = 1;

        //Filter by giver option
        if(giver_id) {
            query += ` AND giver_id = $${paramCount}`;
            params.push(giver_id);
            paramCount++;
        }

        if(method) {
            query += ` AND method = $${paramCount}`;
            params.push(method);
            paramCount++;
        }

        if(start_date) {
            query += ` AND date >= $${paramCount}`;
            params.push(start_date);
            paramCount++;
        }

        if(end_date) {
            query += ` AND date <= $${paramCount}`;
            params.push(end_date);
            paramCount++;
        }

        query += ` ORDER BY date DESC, id DESC`;
        
        const offerings = await db.any<Offering>(query, params);
        res.status(200).json(offerings);
    } 
    catch(error)
    {
        console.error('Error fetching offerings:', error);
        res.status(500).json({ error:  'Failed to fetch offerings'});
    }
};


export const getOfferingsByGiver = async(req: Request, res: Response): Promise<void> => {
    try {
        const { giver_id } = req.params;
        const offerings = await db.any<Offering>
        (
            `SELECT * FROM offerings WHERE giver_id = $1 ORDER BY date DESC`,
            [giver_id]
        );

        res.status(200).json(offerings);
    }
    catch(error)
    {
        console.error('Error fetching giver offerings:', error);
        res.status(500).json({ error: 'Failed to fetch giver offerings' });
    }
};

 
export const getOfferingsById = async(req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const offering = await db.oneOrNone<Offering>
        (
            `SELECT * FROM offerings where id = $1`,
            [id]
        );

        if(!offering)
        {
            res.status(404).json({ error: "Offering not found" });
            return;
        }

        res.status(200).json(offering);
    }
    catch(error)
    {
        console.error('Error fetching giver offerings: ', error);
        res.status(500).json({ error: 'Failed to fetch giver offerings'});
    }
};

export const createOffering = async(req: Request, res: Response): Promise<void> => {
    try {
        const {giver_id, amount, date, method, category, check_number, notes } = req.body;
        const userId = req.user?.id;

        if(!giver_id || !amount || !date || !method)
        {
            res.status(400).json({ error: "Giver, amount, date, and method are required"});
            return;
        }

        if(amount <= 0)
        {
            res.status(400).json({ error: "Amount must be greater than 0"})
            return;
        }

        const giverExists = await db.oneOrNone(`SELECT id FROM givers WHERE id = $1`, [giver_id]);
        if(!giverExists) {
            res.status(404).json({ error: 'Giver not found'});
            return;
        }

       
        //New Offering
        const newOffering = await db.one<Offering>(
            `INSERT INTO offerings (giver_id, amount, date, method, category, check_number, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [giver_id, amount, date, method, category || 'general', check_number || null, notes || null, userId]
        );

        res.status(201).json(newOffering);
        }
        catch(error)
        {
            console.error('Error creating offering:', error);
            res.status(500).json({ error: 'Failed to create offering'});
        }
    };

    //Updating an offering
    export const updateOffering = async(req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { giver_id, amount, date, method, category, check_number, notes } = req.body;

            if(!giver_id || !amount || !date || !method)
            {
                res.status(400).json({ error: "Giver, amount, date, and method are required"});
                return;
            }

            if(amount <= 0)
            {
                res.status(400).json({ error: "Amount must be greater than 0"})
                return;
            }

            const updatedOffering = await db.oneOrNone<Offering>(
                `UPDATE offerings SET giver_id = $1, amount = $2, date = $3, method = $4, category = $5, check_number = $6, notes = $7 WHERE id = $8 RETURNING *`,
                [giver_id, amount, date, method, category || 'general', check_number || null, notes || null, id]
            );

            if(!updatedOffering)
            {
                res.status(404).json({ error: 'Offering not found '});
                return;
            }

            res.status(200).json(updatedOffering);
        }
        catch(error)
        {
            console.error('Error updating offering:', error);
            res.status(500).json({ error: "Failed to update offering"});
        }
    };

    //Deleting an offering
    export const deleteOffering = async(req: Request, res: Response): Promise<void> => {
        try {

            const { id } = req.params;
            const deletedOffering = await db.oneOrNone<Offering>
            (
                `DELETE FROM offerings WHERE id = $1 RETURNING *`,
                [id]
            );

            if(!deletedOffering)
            {
                res.status(404).json({ error: 'Offering not found '});
                return;
            }

            res.status(200).json({ message: "Offering deleted succesfully" });
        }
        catch(error)
        {
            console.error('Error deleting offering:', error);
            res.status(500).json({ error: 'Failed to delete offering' });
        }
    };

    //Getting stats
    export const getOfferingStats = async(req: Request, res: Response): Promise<void> => {
        try {
            const {start_date, end_date} = req.query;

            let query = 
            `SELECT COUNT(*) as total_amount, SUM(amount) as total_amount, AVG(amount) as average_amount, method, COUNT(*) as method_count FROM offerings where 1=1`;
            
            const params: any[] = [];
            let paramCount = 1;

            if(start_date)
            {
                query += ` AND date >= $${paramCount}`;
                params.push(start_date);
                paramCount++;
            }

            if(end_date)
            {
                query += ` AND date <= $${paramCount}`;
                params.push(end_date);
                paramCount++;
            }

            query += ` GROUP BY method`;
            const stats = await db.any(query, params);

            //Getting the overall total
            let totalQuery = `SELECT COUNT(*) as count, SUM(amount) as total FROM offerings WHERE 1=1`;
            const totalParams: any[] = [];
            let totalParamCount = 1;

            if(start_date)
            {
                totalQuery += ` AND date >= $${totalParamCount}`;
                totalParams.push(start_date);
                totalParamCount++;
            }

            if(end_date)
            {
                totalQuery += ` AND date <= $${totalParamCount}`;
                totalParams.push(end_date);
            }

            const overall = await db.one(totalQuery, totalParams);
            res.status(200).json({
                overall: {
                    total_offerings: parseInt(overall.count),
                    total_amount: parseFloat(overall.total) || 0,
                },
                by_method: stats,
            });
        }
        catch(error){
            console.error('Error fetching offering stats:', error);
            res.status(500).json({ error: 'Failed to fetch offering stats '});
        }
    };




        



    
    