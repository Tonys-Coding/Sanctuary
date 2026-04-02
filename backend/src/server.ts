import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database';
import authRoutes from './routes/authRoutes';
import giversRoutes from './routes/giversRoutes';
import offeringRoutes from './routes/offeringRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import path from 'path/win32';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

//Server Static Files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));


// Test database connection on startup
testConnection();


//Welcome
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Welcome to the Church Project System',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      register: ' POST /api/auth/register',
      login: ' POST /api/auth/login',
    }
  })
})

//protected routes
app.use('/api/auth', authRoutes);
app.use('/api/givers', giversRoutes);
app.use('/api/offerings', offeringRoutes);
app.use('/api/dashboard', dashboardRoutes);



// Test route
app.get('/api/test', (req: Request, res: Response) => {
  res.json({ message: 'Backend is working!' });
});

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});


// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});