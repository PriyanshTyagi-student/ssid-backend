import { initDatabase, getDb } from './src/database/connection.js';
import { auditLogs } from './src/database/schema/audit.js';
import { desc } from 'drizzle-orm';

async function checkAudit() {
  await initDatabase();
  const db = getDb();
  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  console.log('RECENT AUDIT LOGS:');
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}

checkAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
