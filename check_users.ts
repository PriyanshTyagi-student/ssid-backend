import { initDatabase, getDb } from './src/database/connection.js';
import { users } from './src/database/schema/users.js';

async function main() {
  await initDatabase();
  const db = getDb();
  const allUsers = await db.select().from(users);
  console.log('USERS IN DB:');
  console.log(JSON.stringify(allUsers.map(u => ({
    id: u.id,
    name: u.name,
    phoneNumber: u.phoneNumber,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
  })), null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
