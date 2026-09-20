import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
/**
 * Validates and inspects an uploaded APK file.
 * Extracts the authoritative package name, versionName, and versionCode from AndroidManifest.xml.
 * Computes exact SHA-256 checksum and file size.
 */
export async function inspectApk(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('APK file not found on server');
    }
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) {
        throw new Error('APK file is empty (0 bytes)');
    }
    const maxBytes = env.MAX_APK_SIZE_MB * 1024 * 1024;
    if (stat.size > maxBytes) {
        throw new Error(`APK file exceeds maximum permitted size of ${env.MAX_APK_SIZE_MB}MB (received ${(stat.size / (1024 * 1024)).toFixed(1)}MB)`);
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
    const rawVersionName = manifest.versionName != null ? String(manifest.versionName).trim() : '';
    if (!rawVersionName) {
        throw new Error('APK does not define a valid versionName in AndroidManifest.xml');
    }
    const rawVersionCode = Number(manifest.versionCode);
    if (!Number.isInteger(rawVersionCode) || rawVersionCode < 1) {
        throw new Error(`APK defines an invalid versionCode: "${manifest.versionCode}". Must be an integer >= 1.`);
    }
    // 2. Compute SHA-256 over exact stored bytes
    const sha256 = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
    return {
        packageName,
        versionName: rawVersionName,
        versionCode: rawVersionCode,
        fileSize: stat.size,
        sha256,
    };
}
//# sourceMappingURL=apkInspector.js.map