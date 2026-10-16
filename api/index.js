// Vercel serverless function: forwards every request to the compiled
// Nest app (built by `npm run build` into dist/). See src/serverless.ts.
module.exports = require('../dist/serverless').default;
