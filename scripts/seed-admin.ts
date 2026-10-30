// Cria um usuário com o papel ADMIN — usado para o primeiro acesso em um ambiente novo.
// Uso: npx tsx scripts/seed-admin.ts <email> <senha> [nome]
// (no container: docker exec ... npx tsx scripts/seed-admin.ts ...; ver Dockerfile).
// A senha é recebida por argumento e vira hash em createUser; ela fica no histórico do shell — troque-a após o primeiro login.
// Falha se o e-mail já existir (restrição única em User.email).
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
