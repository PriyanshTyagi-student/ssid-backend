import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../database/connection.js';
import { appReleases, AppRelease, AppReleaseStatus, NewAppRelease } from '../../database/schema/app_releases.js';
import { inspectApk } from './apkInspector.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class AppUpdateService {
  private static storageDir: string = path.resolve(process.cwd(), env.APK_STORAGE_DIR);

  /**
   * Ensure APK storage directory exists on disk.
   */
  public static ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      logger.info({ dir: this.storageDir }, '[APK_STORAGE] Created APK storage directory');
    }
  }

  /**
   * Generates a temporary staging file path directly inside the APK storage directory.
   * This enables instant atomic filesystem rename upon upload completion without copying.
   */
  public static createStagingFilePath(originalFilename: string): string {
    this.ensureStorageDir();
    const rand = crypto.randomBytes(6).toString('hex');
    const safeName = path.basename(originalFilename).replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.storageDir, `.staging_${Date.now()}_${rand}_${safeName}`);
  }

  /**
   * Get safe absolute path within storage directory, preventing path traversal.
   */
  private static getSafePath(filename: string): string {
    const resolved = path.resolve(this.storageDir, filename);
    if (!resolved.startsWith(this.storageDir)) {
      throw new Error('Access denied: Path traversal detected');
    }
    return resolved;
  }

  /**
   * Create a new draft release from an uploaded APK file.
   */
  public static async createDraftRelease(params: {
    tempFilePath: string;
    precomputedSha256?: string;
    precomputedSize?: number;
    releaseNotes?: string;
    mandatory?: boolean;
    userId: string;
  }): Promise<AppRelease> {
    this.ensureStorageDir();

    // 1. Inspect APK package: extract versionName, versionCode, package, SHA-256
    const inspected = await inspectApk(params.tempFilePath, {
      precomputedSha256: params.precomputedSha256,
      precomputedSize: params.precomputedSize,
    });

    // 2. Build sanitized target filename
    const safeVersion = inspected.versionName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `ssid-v${safeVersion}.apk`;
    const targetPath = this.getSafePath(filename);

    // 3. Move/rename APK to storage directory (atomic rename without redundant copy)
    try {
      if (fs.existsSync(targetPath)) {
        try {
          await fs.promises.unlink(targetPath);
        } catch (_) {}
      }
      try {
        await fs.promises.rename(params.tempFilePath, targetPath);
      } catch {
        // Fallback if cross-device
        await fs.promises.copyFile(params.tempFilePath, targetPath);
        await fs.promises.unlink(params.tempFilePath).catch(() => {});
      }
    } catch (err: any) {
      logger.error({ err, targetPath }, '[APK_STORAGE] Failed to store APK file');
      throw new Error(`Failed to save APK into storage: ${err?.message || err}`);
    }

    // 4. Record draft in database
    const db = getDb();
    const newRelease: NewAppRelease = {
      versionName: inspected.versionName,
      versionCode: inspected.versionCode,
      packageName: inspected.packageName,
      filename,
      fileSize: inspected.fileSize,
      sha256: inspected.sha256,
      releaseNotes: params.releaseNotes?.trim() || null,
      mandatory: Boolean(params.mandatory),
      status: AppReleaseStatus.DRAFT,
      uploadedBy: params.userId,
    };

    const [inserted] = await db.insert(appReleases).values(newRelease).returning();
    logger.info(
      { releaseId: inserted.id, version: inserted.versionName, code: inserted.versionCode },
      '[APK_UPDATE] Created new draft release'
    );

    return inserted;
  }

  /**
   * Publish a draft release atomically.
   * Archives any currently published release and sets the target release as published.
   */
  public static async publishRelease(id: string, userId: string): Promise<AppRelease> {
    const db = getDb();

    // 1. Check target release exists
    const [target] = await db.select().from(appReleases).where(eq(appReleases.id, id));
    if (!target) {
      throw new Error('Release not found');
    }

    // 2. Check APK file exists on disk and is readable
    const filePath = this.getSafePath(target.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`APK file "${target.filename}" does not exist on storage. Cannot publish.`);
    }

    // 3. Atomically transition: archive all published, then publish this release
    const now = new Date();
    await db.transaction(async (tx: any) => {
      await tx
        .update(appReleases)
        .set({
          status: AppReleaseStatus.ARCHIVED,
          updatedAt: now,
        })
        .where(eq(appReleases.status, AppReleaseStatus.PUBLISHED));

      await tx
        .update(appReleases)
        .set({
          status: AppReleaseStatus.PUBLISHED,
          publishedBy: userId,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(appReleases.id, id));
    });

    const [published] = await db.select().from(appReleases).where(eq(appReleases.id, id));
    logger.info(
      { releaseId: id, version: target.versionName, code: target.versionCode, publishedBy: userId },
      '[APK_UPDATE] Successfully published release'
    );

    return published;
  }

  /**
   * Archive a release.
   */
  public static async archiveRelease(id: string): Promise<AppRelease> {
    const db = getDb();
    const [target] = await db.select().from(appReleases).where(eq(appReleases.id, id));
    if (!target) {
      throw new Error('Release not found');
    }

    const now = new Date();
    const [archived] = await db
      .update(appReleases)
      .set({
        status: AppReleaseStatus.ARCHIVED,
        updatedAt: now,
      })
      .where(eq(appReleases.id, id))
      .returning();

    return archived;
  }

  /**
   * Delete a release record (prevented if currently published).
   */
  public static async deleteRelease(id: string): Promise<void> {
    const db = getDb();
    const [target] = await db.select().from(appReleases).where(eq(appReleases.id, id));
    if (!target) {
      throw new Error('Release not found');
    }

    if (target.status === AppReleaseStatus.PUBLISHED) {
      throw new Error('Cannot delete the currently published release. Archive it or publish another version first.');
    }

    await db.delete(appReleases).where(eq(appReleases.id, id));

    // Safely remove file only if no other release record references this filename
    const remaining = await db.select().from(appReleases).where(eq(appReleases.filename, target.filename));
    if (remaining.length === 0) {
      try {
        const filePath = this.getSafePath(target.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info({ filename: target.filename }, '[APK_STORAGE] Deleted unreferenced APK file');
        }
      } catch (err) {
        logger.warn({ err, filename: target.filename }, '[APK_STORAGE] Error removing APK file');
      }
    }
  }

  /**
   * Get the currently published release.
   */
  public static async getPublishedRelease(): Promise<AppRelease | null> {
    const db = getDb();
    const [published] = await db
      .select()
      .from(appReleases)
      .where(eq(appReleases.status, AppReleaseStatus.PUBLISHED))
      .limit(1);

    return published || null;
  }

  /**
   * Get release by ID.
   */
  public static async getReleaseById(id: string): Promise<AppRelease | null> {
    const db = getDb();
    const [release] = await db.select().from(appReleases).where(eq(appReleases.id, id));
    return release || null;
  }

  /**
   * List all releases ordered by creation time descending.
   */
  public static async listReleases(): Promise<AppRelease[]> {
    const db = getDb();
    return db.select().from(appReleases).orderBy(desc(appReleases.createdAt));
  }

  /**
   * Resolves trusted stored APK path for a requested filename.
   * Validates against release records in database to prevent path traversal.
   */
  public static async resolveApkPath(filename: string): Promise<{ filePath: string; release: AppRelease } | null> {
    const db = getDb();
    const [release] = await db.select().from(appReleases).where(eq(appReleases.filename, filename)).limit(1);
    if (!release) {
      return null;
    }

    const filePath = this.getSafePath(release.filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return { filePath, release };
  }

  /**
   * Resolves trusted stored APK path for the currently published release.
   */
  public static async resolveLatestPublishedApk(): Promise<{ filePath: string; release: AppRelease } | null> {
    const published = await this.getPublishedRelease();
    if (!published) return null;

    const filePath = this.getSafePath(published.filename);
    if (!fs.existsSync(filePath)) return null;

    return { filePath, release: published };
  }
}
