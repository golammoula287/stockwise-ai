jest.mock('../config/db', () => ({ getPrisma: jest.fn() }));
const { getPrisma } = require('../config/db');
const { seedDatabase } = require('../utils/seedData');

test('missing private seed credentials fail before any database access or deletion', async () => {
  const previous = process.env.SEED_ADMIN_PASSWORD;
  delete process.env.SEED_ADMIN_PASSWORD;
  try {
    await expect(seedDatabase({ force: true })).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(getPrisma).not.toHaveBeenCalled();
  } finally {
    if (previous !== undefined) process.env.SEED_ADMIN_PASSWORD = previous;
  }
});
