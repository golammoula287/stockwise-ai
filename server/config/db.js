const mongoose = require('mongoose');
const { seedDatabase } = require('../utils/seedData');

let memoryServer = null;
let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const isTest = process.env.NODE_ENV === 'test';
    const useInMemoryDemo = process.env.USE_IN_MEMORY_DB === 'true';

    if (!isTest && !useInMemoryDemo) {
      const configuredUri = process.env.MONGO_URI;
      if (!configuredUri || !configuredUri.trim()) {
        throw new Error(
          'MONGO_URI environment variable is required for persistent MongoDB connection. Set MONGO_URI (e.g. MongoDB Atlas) or explicitly set USE_IN_MEMORY_DB=true for a local demo.'
        );
      }

      await mongoose.connect(configuredUri.trim(), {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      });
      console.log('MongoDB connected:', mongoose.connection.host);

      if (process.env.AUTO_SEED === 'true' && process.env.NODE_ENV !== 'production') {
        await seedDatabase({ force: false });
      }
      return mongoose.connection;
    }

    // Isolated test environment or explicit local demo mode (with replica-set transaction support)
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const memUri = memoryServer.getUri();
    await mongoose.connect(memUri, { autoIndex: true });

    if (!isTest && useInMemoryDemo) {
      console.log('Explicit local demo mode: connected to MongoMemoryReplSet.');
      if (process.env.AUTO_SEED !== 'false') {
        await seedDatabase({ force: false });
      }
    }
    return mongoose.connection;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
