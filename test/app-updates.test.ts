import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initDatabase, closeDatabase } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedDatabase } from '../src/database/seed.js';
import { AppUpdateService } from '../src/modules/app/updateService.js';
import { inspectApk } from '../src/modules/app/apkInspector.js';

describe('App Updates Optimized Fast Upload Pipeline', () => {
  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('createStagingFilePath creates a unique staging path in APK storage directory', () => {
    const stagingPath = AppUpdateService.createStagingFilePath('test-app.apk');
    expect(stagingPath).toContain('.staging_');
    expect(stagingPath.endsWith('_test-app.apk')).toBe(true);
  });

  it('inspectApk uses precomputed SHA-256 and size when provided', async () => {
    // Check if an existing test APK is present in data/apks
    const existingApkPath = path.resolve(process.cwd(), 'data/apks/ssid-v1.0.0.apk');
    if (!fs.existsSync(existingApkPath)) {
      // Skip if no fixture APK exists
      return;
    }

    const testSha = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const testSize = fs.statSync(existingApkPath).size;

    const inspected = await inspectApk(existingApkPath, {
      precomputedSha256: testSha,
      precomputedSize: testSize,
    });

    expect(inspected.packageName).toBe('com.ssid.ssid_app');
    expect(inspected.versionName).toBeDefined();
    expect(inspected.versionCode).toBeGreaterThanOrEqual(1);
    expect(inspected.fileSize).toBe(testSize);
    expect(inspected.sha256).toBe(testSha);
  });

  it('inspectApk falls back to streaming SHA-256 computation if not precomputed', async () => {
    const existingApkPath = path.resolve(process.cwd(), 'data/apks/ssid-v1.0.0.apk');
    if (!fs.existsSync(existingApkPath)) {
      return;
    }

    const inspected = await inspectApk(existingApkPath);
    expect(inspected.packageName).toBe('com.ssid.ssid_app');
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
