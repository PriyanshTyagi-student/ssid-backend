import { getDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { users } from './schema/users.js';
import { projects } from './schema/projects.js';
import { sites } from './schema/sites.js';
import { userProjectAssignments, userSiteAssignments } from './schema/assignments.js';
import { laborCategories } from './schema/labor_categories.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, ProjectStatus, SiteStatus, LaborCategoryType } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { eq, and } from 'drizzle-orm';
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
    // 3. Seed Standard Labor Categories (Idempotent)
    const defaultCategories = [
        // Skilled
        { name: 'Mason', categoryType: LaborCategoryType.SKILLED, orderIndex: 1 },
        { name: 'Carpenter / Shuttering', categoryType: LaborCategoryType.SKILLED, orderIndex: 2 },
        { name: 'Bar Bender / Steel Fixer', categoryType: LaborCategoryType.SKILLED, orderIndex: 3 },
        { name: 'Electrician', categoryType: LaborCategoryType.SKILLED, orderIndex: 4 },
        { name: 'Plumber', categoryType: LaborCategoryType.SKILLED, orderIndex: 5 },
        { name: 'Welder', categoryType: LaborCategoryType.SKILLED, orderIndex: 6 },
        // Unskilled
        { name: 'General Helper (Male)', categoryType: LaborCategoryType.UNSKILLED, orderIndex: 1 },
        { name: 'General Helper (Female)', categoryType: LaborCategoryType.UNSKILLED, orderIndex: 2 },
        { name: 'Beldar / Earthworker', categoryType: LaborCategoryType.UNSKILLED, orderIndex: 3 },
        { name: 'Concrete Porter', categoryType: LaborCategoryType.UNSKILLED, orderIndex: 4 },
        // Supervisory
        { name: 'Site Supervisor', categoryType: LaborCategoryType.SUPERVISORY, orderIndex: 1 },
        { name: 'Safety Officer / Marshal', categoryType: LaborCategoryType.SUPERVISORY, orderIndex: 2 },
        { name: 'Quality Engineer', categoryType: LaborCategoryType.SUPERVISORY, orderIndex: 3 },
    ];
    for (const cat of defaultCategories) {
        const [existing] = await db
            .select()
            .from(laborCategories)
            .where(and(eq(laborCategories.categoryType, cat.categoryType), eq(laborCategories.name, cat.name)))
            .limit(1);
        if (!existing) {
            await db.insert(laborCategories).values({
                name: cat.name,
                categoryType: cat.categoryType,
                orderIndex: cat.orderIndex,
                isActive: true,
            });
            logger.info(`[SEED] Created labor category: [${cat.categoryType}] ${cat.name}`);
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