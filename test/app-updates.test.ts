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
    try {
      await closeDatabase();
    } catch (_) {}
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

  it('inspectApk respects custom overrideVersionName and overrideVersionCode when specified', async () => {
    const existingApkPath = path.resolve(process.cwd(), 'data/apks/ssid-v1.0.0.apk');
    if (!fs.existsSync(existingApkPath)) {
      return;
    }

    const inspected = await inspectApk(existingApkPath, {
      overrideVersionName: '2.5.0-custom',
      overrideVersionCode: 99,
    });

    expect(inspected.versionName).toBe('2.5.0-custom');
    expect(inspected.versionCode).toBe(99);
    expect(inspected.packageName).toBe('com.ssid.ssid_app');
  });

  it('updateRelease updates versionName, versionCode, releaseNotes, and mandatory flag', async () => {
    const existingApkPath = path.resolve(process.cwd(), 'data/apks/ssid-v1.0.1.apk');
    if (!fs.existsSync(existingApkPath)) {
      return;
    }

    const staging = AppUpdateService.createStagingFilePath('test-update.apk');
    await fs.promises.copyFile(existingApkPath, staging);
    const release = await AppUpdateService.createDraftRelease({
      tempFilePath: staging,
      versionName: '2.0.0-draft',
      versionCode: 200,
      userId: '199de4a8-56e1-411e-bb2f-2f8c8f363080',
    });

    const updated = await AppUpdateService.updateRelease(release.id, {
      versionName: '2.0.1-draft',
      versionCode: 201,
      releaseNotes: 'Updated notes',
      mandatory: true,
    });

    expect(updated.id).toBe(release.id);
    expect(updated.versionName).toBe('2.0.1-draft');
    expect(updated.versionCode).toBe(201);
    expect(updated.releaseNotes).toBe('Updated notes');
    expect(updated.mandatory).toBe(true);

    await AppUpdateService.deleteRelease(release.id);
  });
});
