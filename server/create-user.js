/**
 * Create a new organization owner user via CLI.
 * Usage: node create-user.js <email> <password> [name]
 * Example: node create-user.js admin@example.com mysecret123 "Admin User"
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env'), override: true });
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Add it to server/.env');
  process.exit(1);
}

const adapterConfig = databaseUrl.includes('supabase')
  ? { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } }
  : { connectionString: databaseUrl };
const adapter = new PrismaPg(adapterConfig);
const prisma = new PrismaClient({ adapter });

async function createUser() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: node create-user.js <email> <password> [name]');
    console.error('Example: node create-user.js admin@example.com mysecret123 "Admin User"');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const displayName = (name || email.split('@')[0]).trim();

  try {
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      console.error(`❌ User with email ${normalizedEmail} already exists.`);
      process.exit(1);
    }

    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const teamId = crypto.randomUUID();
    const hashedPassword = bcrypt.hashSync(password, 10);

    await prisma.user.create({
      data: {
        id: userId,
        email: normalizedEmail,
        name: displayName,
        password: hashedPassword,
        emailVerified: true,
      },
    });

    await prisma.organization.create({
      data: {
        id: orgId,
        name: `${displayName}'s Organization`,
        ownerId: userId,
        plan: 'free',
      },
    });

    await prisma.team.create({
      data: {
        id: teamId,
        name: `${displayName}'s Team`,
        ownerId: userId,
        organizationId: orgId,
      },
    });

    await prisma.userMembership.create({
      data: {
        userId,
        teamId,
        teamRole: 'owner',
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { activeTeamId: teamId },
    });

    console.log('✅ User created successfully!');
    console.log(`   Email: ${normalizedEmail}`);
    console.log(`   Name: ${displayName}`);
    console.log(`   Role: organization + team owner`);
    console.log(`   Email verified: yes`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createUser();
