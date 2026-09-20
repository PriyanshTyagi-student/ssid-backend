import { initDatabase, getDb, isDbConnected } from './connection.js';
import { logger } from '../utils/logger.js';
import { sql } from 'drizzle-orm';

export async function runMigrations() {
  const { db, client } = await initDatabase();

  logger.info('[MIGRATION] Starting database migrations...');

  const migrationSql = `
    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'site_engineer',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMP WITH TIME ZONE
    );

    CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone_number);
    CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
    CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

    -- Projects Table
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      project_code VARCHAR(50) NOT NULL UNIQUE,
      client_name VARCHAR(255),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS projects_code_idx ON projects (project_code);
    CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

    -- Sites Table
    CREATE TABLE IF NOT EXISTS sites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS sites_project_idx ON sites (project_id);
    CREATE INDEX IF NOT EXISTS sites_status_idx ON sites (status);

    -- User Project Assignments
    CREATE TABLE IF NOT EXISTS user_project_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_project_uniq_idx ON user_project_assignments (user_id, project_id);

    -- User Site Assignments
    CREATE TABLE IF NOT EXISTS user_site_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_site_uniq_idx ON user_site_assignments (user_id, site_id);

    -- Reports Table
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_number VARCHAR(50) NOT NULL UNIQUE,
      report_type VARCHAR(30) NOT NULL DEFAULT 'material',
      project_id UUID NOT NULL REFERENCES projects(id),
      site_id UUID NOT NULL REFERENCES sites(id),
      report_date DATE NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      submitted_at TIMESTAMP WITH TIME ZONE,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      reviewed_by UUID REFERENCES users(id),
      rejection_reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS reports_number_idx ON reports (report_number);
    CREATE INDEX IF NOT EXISTS reports_project_idx ON reports (project_id);
    CREATE INDEX IF NOT EXISTS reports_site_idx ON reports (site_id);
    CREATE INDEX IF NOT EXISTS reports_date_idx ON reports (report_date);
    CREATE INDEX IF NOT EXISTS reports_type_idx ON reports (report_type);
    CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
    CREATE INDEX IF NOT EXISTS reports_created_by_idx ON reports (created_by);

    -- Report Sections Table
    CREATE TABLE IF NOT EXISTS report_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      section_type VARCHAR(50) NOT NULL,
      section_name VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS report_sections_report_idx ON report_sections (report_id);

    -- Report Entries Table
    CREATE TABLE IF NOT EXISTS report_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id UUID NOT NULL REFERENCES report_sections(id) ON DELETE CASCADE,
      entry_data JSONB NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS report_entries_section_idx ON report_entries (section_id);

    -- Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100),
      metadata JSONB DEFAULT '{}',
      ip_address VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs (user_id);
    CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs (action);
    CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_logs (created_at);

    -- Labor Categories Table
    CREATE TABLE IF NOT EXISTS labor_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      category_type VARCHAR(50) NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS labor_cat_type_name_uniq_idx ON labor_categories (category_type, name);
    CREATE INDEX IF NOT EXISTS labor_cat_type_idx ON labor_categories (category_type);
    CREATE INDEX IF NOT EXISTS labor_cat_order_idx ON labor_categories (order_index);
    CREATE INDEX IF NOT EXISTS labor_cat_active_idx ON labor_categories (is_active);

    -- Roles Table
    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      permissions JSONB NOT NULL DEFAULT '[]',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS roles_slug_idx ON roles (slug);
    CREATE INDEX IF NOT EXISTS roles_is_system_idx ON roles (is_system);

    -- Labor Classifications Table
    CREATE TABLE IF NOT EXISTS labor_classifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS labor_class_code_idx ON labor_classifications (code);
    CREATE INDEX IF NOT EXISTS labor_class_is_system_idx ON labor_classifications (is_system);
  `;

  try {
    if (typeof client.exec === 'function') {
      await client.exec(migrationSql);
    } else if (typeof client.query === 'function') {
      await client.query(migrationSql);
    } else {
      await db.execute(sql.raw(migrationSql));
    }

    // Seed default system roles if not exist
    const systemRolesSeed = `
      INSERT INTO roles (name, slug, description, permissions, is_system)
      VALUES 
        ('Administrator', 'admin', 'Full system access, management, and audit visibility', '["reports.view","reports.create","reports.review","reports.approve","reports.reject","reports.delete","reports.export","projects.view","projects.manage","sites.view","sites.manage","users.view","users.manage","settings.view"]'::jsonb, true),
        ('Project Manager', 'project_manager', 'Project oversight, report reviews, and team approvals', '["reports.view","reports.create","reports.review","reports.approve","reports.reject","reports.delete","reports.export","projects.view","projects.manage","sites.view","sites.manage","settings.view"]'::jsonb, true),
        ('Site Engineer', 'site_engineer', 'Field data entry, site operations, and daily reporting', '["reports.view","reports.create","projects.view","sites.view","settings.view"]'::jsonb, true),
        ('Site Supervisor', 'site_supervisor', 'Field supervision, labor attendance, and daily reporting', '["reports.view","reports.create","reports.approve","projects.view","sites.view","settings.view"]'::jsonb, true)
      ON CONFLICT (slug) DO NOTHING;

      INSERT INTO labor_classifications (code, name, description, is_system)
      VALUES
        ('skilled', 'Skilled Labor', 'Specialized and certified trades (masons, electricians, plumbers)', true),
        ('unskilled', 'Unskilled Labor', 'General site labor, helpers, and manual support', true),
        ('supervisory', 'Supervisory & Field Staff', 'Foremen, safety supervisors, and site leaders', true)
      ON CONFLICT (code) DO NOTHING;

      -- Sync any other custom classifications from existing labor_categories
      INSERT INTO labor_classifications (code, name, description, is_system)
      SELECT DISTINCT category_type, INITCAP(REPLACE(category_type, '_', ' ')), 'Imported category classification', false
      FROM labor_categories
      WHERE category_type NOT IN ('skilled', 'unskilled', 'supervisory')
      ON CONFLICT (code) DO NOTHING;
    `;

    if (typeof client.exec === 'function') {
      await client.exec(systemRolesSeed);
    } else if (typeof client.query === 'function') {
      await client.query(systemRolesSeed);
    } else {
      await db.execute(sql.raw(systemRolesSeed));
    }

    logger.info('[MIGRATION] All tables, indexes, constraints, and default roles/classifications verified successfully.');
  } catch (err) {
    logger.error({ err }, '[MIGRATION] Migration execution failed');
    throw err;
  }
}

// Allow direct CLI execution: tsx src/database/migrate.ts
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('✅ Migrations completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
