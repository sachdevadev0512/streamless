// Vercel Serverless Function entry point
// Forwards all /api/* requests to the Express.js application
const app = require('../server/index.js');

module.exports = app;
