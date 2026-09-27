// Cria ou atualiza um acesso da equipe.
// Uso: npm run admin:create -- --email pessoa@empresa.com.br --name "Nome" [--role admin|analyst]
// A senha é pedida no terminal (ou lida de ADMIN_PASSWORD). Mínimo de 12 caracteres.
import "./load-env";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/db";
import { isValidEmail } from "../src/lib/format";
import { hashPassword } from "../src/lib/security";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input: stdin });
      rl.once("line", (line) => {
        rl.close();
        resolve(line);
      });
      rl.once("close", () => resolve(""));
    });
  }
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const name = (arg("name") ?? "").trim();
  const role = arg("role") === "analyst" ? "analyst" : "admin";
  if (!isValidEmail(email) || name.length < 2) {
    console.error('Uso: npm run admin:create -- --email pessoa@empresa.com.br --name "Nome" [--role admin|analyst]');
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("Senha (mínimo de 12 caracteres): ");
    const confirmation = await promptHidden("Confirme a senha: ");
    if (password !== confirmation) {
      console.error("As senhas não conferem.");
      process.exit(1);
    }
  }
  if (password.length < 12) {
    console.error("A senha precisa ter pelo menos 12 caracteres.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true, isDemo: false },
    create: { email, name, role, passwordHash, isDemo: false },
  });
  // Troca de senha encerra as sessões abertas.
  await prisma.adminSession.deleteMany({ where: { adminId: admin.id } });
  console.log(`Acesso salvo: ${admin.email} (${admin.role}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
