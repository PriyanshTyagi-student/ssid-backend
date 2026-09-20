import { getDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { users } from './schema/users.js';
import { projects } from './schema/projects.js';
import { sites } from './schema/sites.js';
import { userProjectAssignments, userSiteAssignments } from './schema/assignments.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, ProjectStatus, SiteStatus } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { eq } from 'drizzle-orm';
export async function seedDatabase() {
    await runMigrations();
    const db = getDb();
    logger.info('[SEED] Seeding initial database records...');
    // 1. Check if admin user already exists
    const existingAdmin = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, '+919876543210'))
        .limit(1);
    let adminId;
    let engineerId;
    let managerId;
    if (existingAdmin.length === 0) {
        const adminPassHash = await hashPassword('Admin@123456');
        const [admin] = await db
            .insert(users)
            .values({
            name: 'System Administrator',
            phoneNumber: '+919876543210',
            passwordHash: adminPassHash,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
        })
            .returning();
        adminId = admin.id;
        logger.info(`[SEED] Created Admin user: ${admin.phoneNumber}`);
        const engineerPassHash = await hashPassword('Site@123456');
        const [engineer] = await db
            .insert(users)
            .values({
            name: 'Rahul Sharma',
            phoneNumber: '+919123456789',
            passwordHash: engineerPassHash,
            role: UserRole.SITE_ENGINEER,
            status: UserStatus.ACTIVE,
        })
            .returning();
        engineerId = engineer.id;
        logger.info(`[SEED] Created Site Engineer user: ${engineer.phoneNumber}`);
        const managerPassHash = await hashPassword('Manager@123456');
        const [manager] = await db
            .insert(users)
            .values({
            name: 'Vikram Malhotra',
            phoneNumber: '+919988776655',
            passwordHash: managerPassHash,
            role: UserRole.PROJECT_MANAGER,
            status: UserStatus.ACTIVE,
        })
            .returning();
        managerId = manager.id;
        logger.info(`[SEED] Created Project Manager user: ${manager.phoneNumber}`);
    }
    else {
        adminId = existingAdmin[0].id;
        const [eng] = await db.select().from(users).where(eq(users.phoneNumber, '+919123456789')).limit(1);
        engineerId = eng?.id;
        const [mgr] = await db.select().from(users).where(eq(users.phoneNumber, '+919988776655')).limit(1);
        managerId = mgr?.id;
        logger.info('[SEED] Users already seeded, skipping user creation');
    }
    // 2. Check if project already exists
    const existingProject = await db
        .select()
        .from(projects)
        .where(eq(projects.projectCode, 'PRJ-SKY-001'))
        .limit(1);
    if (existingProject.length === 0) {
        const [project] = await db
            .insert(projects)
            .values({
            name: 'Skyline Commercial Complex',
            projectCode: 'PRJ-SKY-001',
            clientName: 'Apex Urban Developers Ltd.',
            description: 'Construction of commercial high-rise tower with two-level basement parking.',
            status: ProjectStatus.ACTIVE,
        })
            .returning();
        logger.info(`[SEED] Created Project: ${project.name} (${project.projectCode})`);
        // Create Sites
        const [siteA] = await db
            .insert(sites)
            .values({
            projectId: project.id,
            name: 'Tower A - Superstructure',
            location: 'Sector 62, Phase 1',
            description: 'Commercial tower core and structural frame',
            status: SiteStatus.ACTIVE,
        })
            .returning();
        const [siteB] = await db
            .insert(sites)
            .values({
            projectId: project.id,
            name: 'Tower B - Foundation & Podium',
            location: 'Sector 62, Phase 2',
            description: 'Raft foundation and podium structural casting',
            status: SiteStatus.ACTIVE,
        })
            .returning();
        logger.info(`[SEED] Created Sites: ${siteA.name}, ${siteB.name}`);
        // Assign Engineer to Tower A and Tower B
        if (engineerId) {
            await db.insert(userProjectAssignments).values({
                userId: engineerId,
                projectId: project.id,
            });
            await db.insert(userSiteAssignments).values([
                { userId: engineerId, siteId: siteA.id },
                { userId: engineerId, siteId: siteB.id },
            ]);
            logger.info(`[SEED] Assigned Site Engineer Rahul Sharma to Project and Sites`);
        }
        if (managerId) {
            await db.insert(userProjectAssignments).values({
                userId: managerId,
                projectId: project.id,
            });
            logger.info(`[SEED] Assigned Project Manager Vikram Malhotra to Project`);
        }
    }
    else {
        logger.info('[SEED] Projects and Sites already seeded, skipping');
    }
    // 3. Seed Core System Roles (Idempotent for test & environment setups)
    const { roles } = await import('./schema/roles.js');
    const defaultRoles = [
        {
            name: 'System Administrator',
            slug: 'admin',
            description: 'Full system and administrative access',
            permissions: [
                'reports.view', 'reports.create', 'reports.review', 'reports.approve', 'reports.reject', 'reports.delete', 'reports.export',
                'projects.view', 'projects.manage',
                'sites.view', 'sites.manage',
                'users.view', 'users.manage',
                'labor_categories.view', 'labor_categories.manage',
                'system.audit', 'system.roles',
            ],
            isSystem: true,
        },
        {
            name: 'Project Manager',
            slug: 'project_manager',
            description: 'Project governance, report approval, and site management',
            permissions: [
                'reports.view', 'reports.review', 'reports.approve', 'reports.reject', 'reports.export',
                'projects.view', 'projects.manage',
                'sites.view', 'sites.manage',
                'users.view',
                'labor_categories.view', 'labor_categories.manage',
            ],
            isSystem: true,
        },
        {
            name: 'Site Engineer',
            slug: 'site_engineer',
            description: 'Daily site reporting and logging',
            permissions: [
                'reports.view', 'reports.create',
                'projects.view',
                'sites.view',
                'labor_categories.view',
            ],
            isSystem: true,
        },
        {
            name: 'Site Supervisor',
            slug: 'site_supervisor',
            description: 'On-site monitoring and field report drafting',
            permissions: [
                'reports.view', 'reports.create',
                'sites.view',
            ],
            isSystem: true,
        },
    ];
    for (const r of defaultRoles) {
        const [existingRole] = await db
            .select()
            .from(roles)
            .where(eq(roles.slug, r.slug))
            .limit(1);
        if (!existingRole) {
            await db.insert(roles).values(r);
            logger.info(`[SEED] Created system role: ${r.name} (${r.slug})`);
        }
    }
    logger.info('[SEED] Database seeding complete.');
}
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
    seedDatabase()
        .then(() => {
        console.log('✅ Seeding completed successfully');
        process.exit(0);
    })
        .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map