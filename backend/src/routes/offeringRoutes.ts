import express from 'express';
import {
    getAllOfferings,
    getOfferingsById,
    getOfferingsByGiver, 
    createOffering,
    updateOffering,
    deleteOffering,
    getOfferingStats
} from '../controllers/offeringsController'
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

//All routes are protected
router.use(authenticate);

// GET api/offerings - Get all offerings with filters
router.get('/', getAllOfferings);

// GET api/offerings/stats - Get offerings statistics
router.get('/stats', getOfferingStats);

// GET /api/offerings/giver/:giver_id - Get offerings from specific giver
router.get('/giver/:giver_id', getOfferingsByGiver);

//GET /api/offerings/:id - Get single offering
router.get('/:id', getOfferingsById);

// POST /api/offerings - Create new offering
router.post('/', createOffering);

// PUT /api/offerings/:id - Update offering
router.put('/:id', updateOffering);

// DELETE /api/offering/:id - Delete offering
router.delete('/:id', deleteOffering);

export default router;
