import "dotenv/config";
import { createUser } from "../src/lib/db/users";

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Uso: npx tsx scripts/seed-admin.ts <email> <senha> [nome]");
    process.exit(1);
  }

  const user = await createUser(email, password, name, "ADMIN");
  console.log("Usuário criado:", user);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
