import { Request, Response } from 'express';
import db from '../config/database';

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try{
        //Getting date 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        //total givers
        const giversCount = await db.one(`SELECT COUNT(*) AS count FROM givers`);

        //All time total offerings
        const totalOfferings = await db.one(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM offerings`);


        //This months offerings
        const currentMonth = new Date().toISOString().slice(0, 7); //Format: YYYY-MM
        const thisMonthsOfferings = await db.one(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
            FROM offerings 
            WHERE date >= $1`, 
            [`${currentMonth}-01`]);


        //Recent offerings in the last 30 days
        const recentOfferings = await db.one(
            'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM offerings WHERE date >= $1', [thirtyDaysAgoStr]);
        
        
        //Offerings by method
        const offeringsByMethod = await db.any(
            `SELECT method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM offerings GROUP BY method ORDER BY total DESC`);

        
        //The top givers by total $
        const topGivers = await db.any(
            'SELECT g.id, g.name, COUNT(o.id) as offerring_count, COALESCE(SUM(o.amount), 0) as total_amount FROM givers g LEFT JOIN offerings o ON g.id = o.giver_id GROUP BY g.id, g.name ORDER BY total_amount DESC LIMIT 5');

        
        // Offerings in 12 months time 
        const offeringsOverTime = await db.any(
            `SELECT TO_CHAR(date, 'YYYY-MM') as month, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM offerings WHERE date >= NOW() - INTERVAL '12 months' GROUP BY month ORDER BY month ASC`);

        
        // Recent activity from last 10 offerings
        const recentActivity = await db.any(
            'SELECT o.id, o.amount, o.date, o.method, o.created_at, g.name as giver_name FROM offerings o JOIN givers g ON o.giver_id = g.id ORDER BY o.created_at DESC LIMIT 10');

        res.status(200).json({
            summary: {
                total_givers: parseInt(giversCount.count),
                total_offerings_count: parseInt(totalOfferings.count),
                total_offerings_amount: parseFloat(totalOfferings.total),
                this_month_count: parseInt(thisMonthsOfferings.count),
                this_month_amount: parseFloat(thisMonthsOfferings.total),
                recent_count: parseInt(recentOfferings.count),
                recent_amount: parseFloat(recentOfferings.total),
            },
            offerings_by_method: offeringsByMethod.map(row => ({
                method: row.method,
                count: parseInt(row.count),
                total: parseFloat(row.total),
            })),
            top_givers: topGivers.map(row => ({
                id: row.id,
                name: row.name,
                offering_count: parseInt(row.offering_count),
                total_amount: parseFloat(row.total_amount),
            })),
            offerings_over_time: offeringsOverTime.map(row => ({
                month: row.month,
                count: parseInt(row.count),
                total: parseFloat(row.total),
            })),
            recent_activity: recentActivity.map(row => ({
                id: row.id, 
                amount: parseFloat(row.amount),
                date: row.date,
                method: row.method,
                giver_name: row.giver_name,
                created_at: row.created_at,
            })),
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
  };

