/**
 * Reset demo user password to ensure it's correct
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env (override: true ensures .env wins over shell env vars)
dotenv.config({ path: join(__dirname, '.env'), override: true });
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Add it to server/.env');
  process.exit(1);
}

// Pass connectionString directly to PrismaPg (creates its own pool)
const adapterConfig = databaseUrl.includes('supabase')
  ? { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } }
  : { connectionString: databaseUrl };
const adapter = new PrismaPg(adapterConfig);
const prisma = new PrismaClient({ adapter });

async function resetPassword() {
  try {
    console.log('🔄 Resetting demo user password...\n');
    
    // Find demo user
    const user = await prisma.user.findUnique({
      where: { email: 'demo@example.com' }
    });
    
    if (!user) {
      console.log('❌ Demo user not found. Creating...\n');
      
      // Create demo team
      const teamId = crypto.randomUUID();
      await prisma.team.create({
        data: {
          id: teamId,
          name: 'Demo Team',
          ownerId: 'demo-user-id',
        },
      });
      
      // Create demo user
      const hashedPassword = bcrypt.hashSync('demo123', 10);
      await prisma.user.create({
        data: {
          id: 'demo-user-id',
          email: 'demo@example.com',
          name: 'Demo User',
          password: hashedPassword,
          teamId: teamId,
          teamRole: 'owner',
        },
      });
      
      console.log('✅ Demo user created!');
      console.log('   Email: demo@example.com');
      console.log('   Password: demo123\n');
    } else {
      // Reset password
      const hashedPassword = bcrypt.hashSync('demo123', 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });
      
      console.log('✅ Password reset!');
      console.log('   Email: demo@example.com');
      console.log('   Password: demo123\n');
    }
    
    // Verify
    const updatedUser = await prisma.user.findUnique({
      where: { email: 'demo@example.com' }
    });
    
    const isValid = bcrypt.compareSync('demo123', updatedUser.password);
    console.log('✅ Password verification:', isValid ? 'PASSED' : 'FAILED');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
