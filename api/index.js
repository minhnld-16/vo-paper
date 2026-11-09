const { createApp } = require('../server');
const { storeFromEnv } = require('../redis-store');
const app = createApp({ serverless: true, store: storeFromEnv({ ...process.env, VERCEL: '1' }) });
module.exports = app.listeners('request')[0];
