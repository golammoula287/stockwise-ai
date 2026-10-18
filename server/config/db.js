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
    const configuredUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stockwise';

    if (!isTest) {
      try {
        await mongoose.connect(configuredUri, {
          autoIndex: true,
          serverSelectionTimeoutMS: 2500,
        });
        console.log('MongoDB connected:', mongoose.connection.host);
        await seedDatabase({ force: false });
        return mongoose.connection;
      } catch (err) {
        console.warn(`Primary MongoDB (${configuredUri}) unavailable (${err.message}). Starting embedded MongoDB memory server...`);
      }
    }

    // Fallback or test mode: use MongoMemoryServer
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    const memUri = memoryServer.getUri();
    await mongoose.connect(memUri, { autoIndex: true });
    if (!isTest) {
      console.log('Embedded MongoDB connected & seeding initial data...');
      await seedDatabase({ force: false });
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
