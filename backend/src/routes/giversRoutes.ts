import express from 'express';
import {
    getAllGivers,
    getGiverById,
    createGiver,
    uploadProfilePicture,
    deleteProfilePicture,
    updateGiver,
    deleteGiver
} from '../controllers/giversController';
import { authenticate } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware';

const router = express.Router();



//All the routes are protected, you must be logged in
router.use(authenticate);

// GET /api/givers - get all givers
router.get('/', getAllGivers);

// GET api/givers/:id - giver by ID
router.get('/:id', getGiverById);

// POST /api/givers - create a new giver
router.post('/', createGiver);

// PUT /api/givers/:id - update a giver's info
router.put('/:id', updateGiver);

// DELETE /api/givers/:id - delete a giver
router.delete('/:id', deleteGiver);

// POST /api/givers/:id/profile-picture - upload profile picture
router.post('/:id/profile-picture', upload.single('profile-picture'), uploadProfilePicture);

// DELETE /api/givers/:id/profile-picture - delete profile picture
router.delete('/:id/profile-picture', deleteProfilePicture);

router.post('/test-upload', upload.single('profile_picture'), (req, res) => {
  console.log('Test upload - File:', req.file);
  console.log('Test upload - Body:', req.body);
  
  if (req.file) {
    res.json({ success: true, file: req.file });
  } else {
    res.status(400).json({ error: 'No file received' });
  }
});

export default router;