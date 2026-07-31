/**
 * Wise Sprinklers & Lighting — management API as a Netlify Function,
 * backed by Netlify Database (managed Postgres / Neon).
 *
 * `@netlify/neon` reads the NETLIFY_DATABASE_URL that Netlify injects when a
 * database is attached to the site — no secrets to configure. The schema is
 * created and seeded automatically on the first request (idempotent).
 *
 * All request/response logic lives in ../../src/api-core.js so the exact same
 * code is exercised by the local Postgres test suite.
 */
const serverless = require('serverless-http');
const { neon } = require('@netlify/neon');
const { createApp } = require('../../src/api-core');

// Neon HTTP client — auto-reads process.env.NETLIFY_DATABASE_URL
const sql = neon();

// Uniform data access: db(text, params) -> Promise<rows[]>
const db = (text, params = []) => sql.query(text, params);

// binary types must be flagged so images are returned as raw bytes (not mangled as text)
module.exports.handler = serverless(createApp(db), {
  binary: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'application/octet-stream'],
});
