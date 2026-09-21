export interface InspectedApk {
    packageName: string;
    versionName: string;
    versionCode: number;
    fileSize: number;
    sha256: string;
}
export interface InspectApkOptions {
    precomputedSha256?: string;
    precomputedSize?: number;
}
/**
 * Validates and inspects an uploaded APK file.
 * Extracts the authoritative package name, versionName, and versionCode from AndroidManifest.xml.
 * Computes exact SHA-256 checksum and file size (skips redundant disk re-reads if precomputed).
 */
export declare function inspectApk(filePath: string, options?: InspectApkOptions): Promise<InspectedApk>;
