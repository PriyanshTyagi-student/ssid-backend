import { initDatabase, getDb } from './src/database/connection.js';
import { users } from './src/database/schema/users.js';
import { verifyPassword } from './src/utils/password.js';
import { AuthService } from './src/modules/auth/service.js';

async function testLogins() {
  await initDatabase();
  const db = getDb();
  const allUsers = await db.select().from(users);

  console.log('Testing logins for all users in DB:');
  const passwordsToTest = ['Admin@123456', 'Site@123456', 'Manager@123456', 'Auditor@123456', '123456', 'password'];

  for (const u of allUsers) {
    console.log(`\nUser: ${u.name} (${u.phoneNumber}, role: ${u.role}, status: ${u.status})`);
    let matchedPass: string | null = null;
    for (const p of passwordsToTest) {
      if (await verifyPassword(u.passwordHash, p)) {
        matchedPass = p;
        break;
      }
    }
    console.log(`  Password matched: ${matchedPass ?? 'NONE OF COMMON PASSWORDS'}`);

    if (matchedPass) {
      try {
        const res = await AuthService.login(u.phoneNumber, matchedPass);
        console.log(`  AuthService.login succeeded! User payload:`, JSON.stringify(res.user, null, 2));
      } catch (err: any) {
        console.error(`  AuthService.login failed:`, err.message);
      }
    }
  }

  process.exit(0);
}

testLogins().catch(e => { console.error(e); process.exit(1); });
