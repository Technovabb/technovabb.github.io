import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config, rootDir } from '../config.js';

let database;

/** Opens the database, creating the file and schema on first run. */
export function getDb() {
  if (database) return database;

  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  database = new DatabaseSync(config.databasePath);
  database.exec(readFileSync(path.join(rootDir, 'src/db/schema.sql'), 'utf8'));
  return database;
}

/** Opens an isolated in-memory database with the schema applied — used by tests. */
export function createMemoryDb() {
  const db = new DatabaseSync(':memory:');
  // WAL is meaningless for an in-memory database and SQLite rejects it there.
  const schema = readFileSync(path.join(rootDir, 'src/db/schema.sql'), 'utf8').replace(
    /PRAGMA journal_mode = WAL;/,
    '',
  );
  db.exec(schema);
  return db;
}

export function setDb(db) {
  database = db;
}

export function closeDb() {
  if (database) {
    database.close();
    database = undefined;
  }
}

/**
 * Runs `fn` inside a transaction, rolling back if it throws. SQLite has no
 * nested transactions, so a call made while one is already open simply joins it.
 */
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction was already rolled back by SQLite; the original error
      // is the one worth reporting.
    }
    throw error;
  }
}
