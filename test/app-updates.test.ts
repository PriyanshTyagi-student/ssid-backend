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
    const published = await AppUpdateService.getPublishedRelease();
    if (!published) {
      // If none published, list releases or skip
      const releases = await AppUpdateService.listReleases();
      if (releases.length === 0) return;
      const target = releases[0];
      const updated = await AppUpdateService.updateRelease(target.id, {
        versionName: '1.9.9-test',
        versionCode: 88,
        releaseNotes: 'Updated release notes test',
        mandatory: true,
      });
      expect(updated.versionName).toBe('1.9.9-test');
      expect(updated.versionCode).toBe(88);
      expect(updated.releaseNotes).toBe('Updated release notes test');
      expect(updated.mandatory).toBe(true);
      return;
    }

    const originalVersionName = published.versionName;
    const originalVersionCode = published.versionCode;

    // Update published release
    const updated = await AppUpdateService.updateRelease(published.id, {
      versionName: `${originalVersionName}-edit`,
      versionCode: originalVersionCode + 1,
      releaseNotes: 'Edited live release notes',
      mandatory: true,
    });

    expect(updated.id).toBe(published.id);
    expect(updated.versionName).toBe(`${originalVersionName}-edit`);
    expect(updated.versionCode).toBe(originalVersionCode + 1);
    expect(updated.releaseNotes).toBe('Edited live release notes');
    expect(updated.mandatory).toBe(true);

    // Revert back for consistency
    await AppUpdateService.updateRelease(published.id, {
      versionName: originalVersionName,
      versionCode: originalVersionCode,
      releaseNotes: published.releaseNotes,
      mandatory: published.mandatory,
    });
  });
});
