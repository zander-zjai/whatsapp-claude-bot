'use strict';

// Daily backup script for ZJAI's persisted data files.
//
// Usage:  node backup.js   (or "npm run backup")
//
// Copies clients.json and logs.json into backups/ with a date-stamped
// filename, then deletes any backups older than 30 days. Safe to run
// repeatedly — re-running on the same day overwrites that day's backup.
//
// Schedule this daily in production, e.g. via a Railway Cron Job service
// running "node backup.js" (see README.md for setup instructions).

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./src/fileStore');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RETENTION_DAYS = 30;
const FILES_TO_BACKUP = ['clients.json', 'logs.json'];

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function backupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const stamp = todayStamp();

  for (const filename of FILES_TO_BACKUP) {
    const source = path.join(DATA_DIR, filename);
    if (!fs.existsSync(source)) {
      console.log(`[backup] Skipping ${filename} (not found at ${source})`);
      continue;
    }

    const ext = path.extname(filename); // ".json"
    const base = path.basename(filename, ext); // "clients" / "logs"
    const dest = path.join(BACKUP_DIR, `${base}_${stamp}${ext}`);

    fs.copyFileSync(source, dest);
    console.log(`[backup] ${filename} -> ${dest}`);
  }
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pattern = /^(clients|logs)_(\d{4}-\d{2}-\d{2})\.json$/;

  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const match = file.match(pattern);
    if (!match) continue;

    const fileDate = new Date(`${match[2]}T00:00:00.000Z`).getTime();
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(BACKUP_DIR, file));
      console.log(`[backup] Removed old backup: ${file}`);
    }
  }
}

backupFiles();
pruneOldBackups();
console.log('[backup] Done.');
