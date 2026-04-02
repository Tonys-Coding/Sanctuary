import db from './database';
import fs from 'fs';
import path from 'path';

const initDatabase = async () => {
  try {
    console.log('📦 Initializing database...');
    
    // Read the schema SQL file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute the schema
    await db.none(schema);
    
    console.log('✅ Database tables created successfully');
    
    // Check if we need to create a default admin user
    const userCount = await db.one('SELECT COUNT(*) FROM users');
    
    if (parseInt(userCount.count) === 0) {
      console.log('👤 No users found. You will need to create an admin user after starting the server.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
};

initDatabase();