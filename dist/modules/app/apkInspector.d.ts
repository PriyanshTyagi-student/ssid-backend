export interface InspectedApk {
    packageName: string;
    versionName: string;
    versionCode: number;
    fileSize: number;
    sha256: string;
}
/**
 * Validates and inspects an uploaded APK file.
 * Extracts the authoritative package name, versionName, and versionCode from AndroidManifest.xml.
 * Computes exact SHA-256 checksum and file size.
 */
export declare function inspectApk(filePath: string): Promise<InspectedApk>;
