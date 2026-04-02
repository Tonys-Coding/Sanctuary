import multer from 'multer';
import path from 'path';
import { Request } from 'express';

//Configuring Storage

const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb) => {
        cb(null, 'public/uploads/profile-pictures/');
    },

    filename: (req: Request, file: Express.Multer.File, cb) => {
        
        //Creating random unique filename in format: profile-{timestamp}-{randomString}.{ext}
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'giver-' + uniqueSuffix + path.extname(file.originalname));

    }
});

//File filter to only allow image files
const fileFilter = (req: Request, file: Express.Multer.File, cb: any) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    }
    else {
        cb(new Error('Only image files are allowed; please upload a valid image (jpeg, jpg, png, gif, webp).'));
    }
};

//Creating multer instance with storage and file filter
export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB file size limit
    },
    fileFilter: fileFilter
});

