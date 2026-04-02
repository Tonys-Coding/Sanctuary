import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise();

// Database connection
const db = pgp(process.env.DATABASE_URL as string);

// Test the connection
export const testConnection = async (): Promise<void> => {
  try {
    await db.connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

export default db;