/**
 * First-run setup: creates the database, loads the opening catalogue and makes
 * the first admin account.
 *
 *   npm run setup        — set up a fresh database, leave an existing one alone
 *   npm run reset        — throw the database away and start again
 */

import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { config } from '../config.js';
import { closeDb, getDb } from './index.js';
import { isSeeded, seed } from './seed.js';

const force = process.argv.includes('--force');

if (force && existsSync(config.databasePath)) {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = config.databasePath + suffix;
    if (existsSync(path)) rmSync(path);
  }
  console.log('Removed the existing database.');
}

const db = getDb();

if (isSeeded(db)) {
  console.log('The database already has a catalogue. Use `npm run reset` to start again.');
  closeDb();
  process.exit(0);
}

// A generated password is safer than a default one, and it is printed once here
// for whoever runs setup.
const generatedPassword = randomBytes(9).toString('base64url');
const adminPassword = config.admin.password || generatedPassword;

const { credentials } = seed(db, {
  adminEmail: config.admin.email,
  adminPassword,
});

console.log('\nHairify is set up.\n');
console.log(`  Database   ${config.databasePath}`);
console.log(`  Back office ${config.siteUrl}/admin`);
console.log(`  POS         ${config.siteUrl}/pos`);
console.log(`\n  Sign in     ${credentials.email}`);
if (!config.admin.password) {
  console.log(`  Password    ${adminPassword}   <- save this now, it is not shown again`);
} else {
  console.log('  Password    (the ADMIN_PASSWORD from your .env)');
}
console.log(`  Till PIN    ${credentials.pin}   <- change this in Admin → Staff\n`);

closeDb();
