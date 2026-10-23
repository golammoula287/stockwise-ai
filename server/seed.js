require('dotenv').config();
const connectDB = require('./config/db');
const { disconnectDB } = require('./config/db');
const { seedDatabase } = require('./utils/seedData');

async function run() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Refusing destructive seed in production without ALLOW_PRODUCTION_SEED=true');
  }
  await connectDB();
  const force = process.env.SEED_FORCE === 'true';
  const result = await seedDatabase({ force });
  console.log('Seeding complete:', result);
  await disconnectDB();
}

run().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
