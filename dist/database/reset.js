import { initDatabase, getDb, closeDatabase } from './connection.js';
import { runMigrations } from './migrate.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { sql } from 'drizzle-orm';
export async function resetDatabase() {
    if (env.NODE_ENV === 'production') {
        throw new Error('Database reset is forbidden in production environment.');
    }
    logger.info('[RESET] Connecting to database...');
    await initDatabase();
    // Ensure schema is fully up to date
    await runMigrations();
    const db = getDb();
    logger.info('[RESET] Starting atomic deletion of all application records in dependency order...');
    // Execute deletion within transaction
    await db.transaction(async (tx) => {
        // 1. Report details
        await tx.execute(sql.raw('DELETE FROM report_entries;'));
        await tx.execute(sql.raw('DELETE FROM report_sections;'));
        await tx.execute(sql.raw('DELETE FROM reports;'));
        // 2. Assignments
        await tx.execute(sql.raw('DELETE FROM user_site_assignments;'));
        await tx.execute(sql.raw('DELETE FROM user_project_assignments;'));
        // 3. Sites and Projects
        await tx.execute(sql.raw('DELETE FROM sites;'));
        await tx.execute(sql.raw('DELETE FROM projects;'));
        // 4. Labor categories and classifications
        await tx.execute(sql.raw('DELETE FROM labor_categories;'));
        await tx.execute(sql.raw('DELETE FROM labor_classifications;'));
        // 5. App releases and audits
        await tx.execute(sql.raw('DELETE FROM app_releases;'));
        await tx.execute(sql.raw('DELETE FROM audit_logs;'));
        // 6. Users and Roles
        await tx.execute(sql.raw('DELETE FROM users;'));
        await tx.execute(sql.raw('DELETE FROM roles;'));
    });
    // Verify counts
    const tables = [
        'users',
        'roles',
        'projects',
        'sites',
        'reports',
        'report_sections',
        'report_entries',
        'labor_categories',
        'labor_classifications',
        'user_project_assignments',
        'user_site_assignments',
        'app_releases',
        'audit_logs',
    ];
    const counts = {};
    for (const table of tables) {
        const res = await db.execute(sql.raw(`SELECT count(*)::int as count FROM ${table};`));
        const rows = res.rows || res;
        counts[table] = Number(rows[0]?.count ?? 0);
    }
    const output = `
========================================
DATABASE RESET COMPLETE
========================================

Users:              ${counts.users}
Roles:              ${counts.roles}
Projects:           ${counts.projects}
Sites:              ${counts.sites}
Reports:            ${counts.reports}
Labor Categories:   ${counts.labor_categories}
Assignments:        ${counts.user_project_assignments + counts.user_site_assignments}

Schema:             PRESERVED
Application Code:   PRESERVED
Demo Seeding:       DISABLED
========================================
`;
    console.log(output);
    return counts;
}
if (process.argv[1]?.endsWith('reset.ts') || process.argv[1]?.endsWith('reset.js')) {
    resetDatabase()
        .then(async () => {
        await closeDatabase();
        process.exit(0);
    })
        .catch(async (err) => {
        console.error('❌ Reset failed:', err);
        await closeDatabase();
        process.exit(1);
    });
}
//# sourceMappingURL=reset.js.map