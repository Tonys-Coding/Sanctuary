import express from 'express'
import { getDashboardStats } from '../controllers/dashboardController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

//Protected Route
router.use(authenticate);

//GET api/dashboard/stats
router.get('/stats', getDashboardStats);

export default router;