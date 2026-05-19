import { hashPassword } from "../src/lib/auth.js";

const [username, password, role = "admin"] = process.argv.slice(2);

if (!username || !password) {
  console.error("Usage: node scripts/create-user.js <username> <password> [viewer|editor|admin]");
  process.exitCode = 1;
} else {
  const passwordHash = await hashPassword(password);

  console.log(JSON.stringify({
    username,
    passwordHash,
    roles: [role]
  }, null, 2));
}
