/**
 * @file backend/src/config/database.js
 * @description Database configuration file
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment variables.');
}

const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
const useSsl = process.env.DB_SSL !== undefined ? process.env.DB_SSL === 'true' : !isLocalhost;

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

module.exports = dbConfig;
