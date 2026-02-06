import { connectDB, closeDB, getUserByEmail, setUserAdmin } from './database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
const serverEnvPath = join(__dirname, '../.env');
const parentEnvPath = join(__dirname, '../../.env');

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else if (fs.existsSync(parentEnvPath)) {
  dotenv.config({ path: parentEnvPath });
} else {
  dotenv.config();
}

async function setAdmin() {
  try {
    // Get email from command line argument
    const email = process.argv[2];
    if (!email) {
      console.error('Usage: npm run set-admin <email>');
      console.error('Example: npm run set-admin user@example.com');
      process.exit(1);
    }

    await connectDB();
    console.log('Connected to database');

    // Find user by email
    const user = await getUserByEmail(email);
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      await closeDB();
      process.exit(1);
    }

    // Set admin status
    const success = await setUserAdmin(user.id!, true);
    if (success) {
      console.log(`✅ User ${email} is now an admin`);
    } else {
      console.error(`❌ Failed to set admin status for ${email}`);
      await closeDB();
      process.exit(1);
    }

    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('Error setting admin:', error);
    await closeDB();
    process.exit(1);
  }
}

setAdmin();
