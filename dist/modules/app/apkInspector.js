import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
/**
 * Validates and inspects an uploaded APK file.
 * Extracts the authoritative package name, versionName, and versionCode from AndroidManifest.xml,
 * or applies explicit overrides when provided by an administrator.
 * Computes exact SHA-256 checksum and file size (skips redundant disk re-reads if precomputed).
 */
export async function inspectApk(filePath, options) {
    if (!fs.existsSync(filePath)) {
        throw new Error('APK file not found on server');
    }
    const fileSize = options?.precomputedSize ?? (await fs.promises.stat(filePath)).size;
    if (fileSize === 0) {
        throw new Error('APK file is empty (0 bytes)');
    }
    const maxBytes = env.MAX_APK_SIZE_MB * 1024 * 1024;
    if (fileSize > maxBytes) {
        throw new Error(`APK file exceeds maximum permitted size of ${env.MAX_APK_SIZE_MB}MB (received ${(fileSize / (1024 * 1024)).toFixed(1)}MB)`);
    }
    // 1. Inspect actual APK using adbkit-apkreader
    let manifest;
    try {
        let ApkReader;
        try {
            const ApkReaderModule = await import('adbkit-apkreader');
            ApkReader = ApkReaderModule.default || ApkReaderModule;
        }
        catch {
            throw new Error('adbkit-apkreader is not installed on this server. Run "npm install" on the server.');
        }
        const reader = await ApkReader.open(filePath);
        manifest = await reader.readManifest();
    }
    catch (err) {
        logger.warn({ err, filePath }, '[APK] Failed to read APK manifest');
        throw new Error(`Invalid APK package or corrupted archive: ${err?.message || 'cannot parse AndroidManifest.xml'}`);
    }
    if (!manifest || !manifest.package) {
        throw new Error('Corrupted APK: Android package name could not be resolved from AndroidManifest.xml');
    }
    const packageName = String(manifest.package).trim();
    const expectedPackage = env.ANDROID_PACKAGE_NAME.trim();
    if (packageName !== expectedPackage) {
        throw new Error(`Package name mismatch: Expected "${expectedPackage}", but uploaded APK has package "${packageName}"`);
    }
    // Resolve Version Name (prefer explicit override, fallback to manifest)
    const finalVersionName = options?.overrideVersionName?.trim() ||
        (manifest.versionName != null ? String(manifest.versionName).trim() : '');
    if (!finalVersionName) {
        throw new Error('APK does not define a valid versionName in AndroidManifest.xml, and no Version Number was provided.');
    }
    // Resolve Version Code / Build Number (prefer explicit override, fallback to manifest)
    const finalVersionCode = options?.overrideVersionCode != null && options.overrideVersionCode > 0
        ? options.overrideVersionCode
        : Number(manifest.versionCode);
    if (!Number.isInteger(finalVersionCode) || finalVersionCode < 1) {
        throw new Error(`APK defines an invalid versionCode: "${manifest.versionCode}". Must be an integer >= 1.`);
    }
    // 2. Compute SHA-256 (use precomputed hash if available to avoid redundant disk I/O)
    let sha256 = options?.precomputedSha256;
    if (!sha256) {
        sha256 = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }
    return {
        packageName,
        versionName: finalVersionName,
        versionCode: finalVersionCode,
        fileSize,
        sha256,
    };
}
//# sourceMappingURL=apkInspector.js.map