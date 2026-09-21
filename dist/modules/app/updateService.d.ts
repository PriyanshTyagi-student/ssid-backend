import { AppRelease } from '../../database/schema/app_releases.js';
export declare class AppUpdateService {
    private static storageDir;
    /**
     * Ensure APK storage directory exists on disk.
     */
    static ensureStorageDir(): void;
    /**
     * Generates a temporary staging file path directly inside the APK storage directory.
     * This enables instant atomic filesystem rename upon upload completion without copying.
     */
    static createStagingFilePath(originalFilename: string): string;
    /**
     * Get safe absolute path within storage directory, preventing path traversal.
     */
    private static getSafePath;
    /**
     * Create a new draft release from an uploaded APK file.
     */
    static createDraftRelease(params: {
        tempFilePath: string;
        precomputedSha256?: string;
        precomputedSize?: number;
        releaseNotes?: string;
        mandatory?: boolean;
        userId: string;
    }): Promise<AppRelease>;
    /**
     * Publish a draft release atomically.
     * Archives any currently published release and sets the target release as published.
     */
    static publishRelease(id: string, userId: string): Promise<AppRelease>;
    /**
     * Archive a release.
     */
    static archiveRelease(id: string): Promise<AppRelease>;
    /**
     * Delete a release record (prevented if currently published).
     */
    static deleteRelease(id: string): Promise<void>;
    /**
     * Get the currently published release.
     */
    static getPublishedRelease(): Promise<AppRelease | null>;
    /**
     * Get release by ID.
     */
    static getReleaseById(id: string): Promise<AppRelease | null>;
    /**
     * List all releases ordered by creation time descending.
     */
    static listReleases(): Promise<AppRelease[]>;
    /**
     * Resolves trusted stored APK path for a requested filename.
     * Validates against release records in database to prevent path traversal.
     */
    static resolveApkPath(filename: string): Promise<{
        filePath: string;
        release: AppRelease;
    } | null>;
    /**
     * Resolves trusted stored APK path for the currently published release.
     */
    static resolveLatestPublishedApk(): Promise<{
        filePath: string;
        release: AppRelease;
    } | null>;
}
