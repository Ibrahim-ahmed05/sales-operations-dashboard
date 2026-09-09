import { addUser } from "../server/db.mjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const [email = "admin@meridian.local", role = "Admin", name = "Workspace Admin"] =
  process.argv.slice(2);
const password = randomBytes(20).toString("base64url");
addUser(email, name, role, password);
const path = "var/" + email.replace(/[^a-zA-Z0-9]/g, "-") + "-credentials.local";
writeFileSync(
  path,
  `Meridian local account\nEmail: ${email}\nPassword: ${password}\nRole: ${role}\n`,
  { mode: 0o600 },
);
console.log(`Account created. Credentials saved privately to ${path}.`);
