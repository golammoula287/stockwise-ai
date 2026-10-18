require('dotenv').config();
const connectDB = require('./config/db');
const { disconnectDB } = require('./config/db');
const { seedDatabase } = require('./utils/seedData');

async function run() {
  await connectDB();
  const result = await seedDatabase({ force: true });
  console.log('Seeding complete:', result);
  console.log('Login credentials: admin@stockwise.com / admin123 (or john@example.com / admin123)');
  await disconnectDB();
}

run().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
