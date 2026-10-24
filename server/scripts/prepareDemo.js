require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPrisma, disconnectDB } = require('../config/db');

async function run() {
  const email = (process.env.DEMO_LOGIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEMO_LOGIN_PASSWORD || '';
  if (!email || password.length < 16 || /^(replace_with|change_me)/i.test(password)) {
    throw new Error('Set DEMO_LOGIN_EMAIL and a private DEMO_LOGIN_PASSWORD (16+ characters)');
  }
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'staff') {
    throw new Error('Demo email belongs to a privileged user; choose a dedicated staff email');
  }
  const data = {
    name: 'Portfolio Visitor',
    password: await bcrypt.hash(password, 10),
    role: 'staff',
    businessName: 'StockWise AI',
  };
  await prisma.user.upsert({ where: { email }, update: data, create: { ...data, email } });
  console.log('Dedicated staff demo login prepared. Credentials remain in the server environment.');
}

run().catch(() => {
  console.error('Demo login preparation failed. Check credentials, staff email ownership, and database connectivity.');
  process.exitCode = 1;
}).finally(disconnectDB);
