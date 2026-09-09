import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const source = resolve("var/dashboard.sqlite");
const functionsDirectory = resolve(".vercel/output/functions");

if (!existsSync(source)) {
  throw new Error(`Dashboard database is missing: ${source}`);
}

if (!existsSync(functionsDirectory)) {
  throw new Error(`Vercel functions output is missing: ${functionsDirectory}`);
}

const functionBundles = readdirSync(functionsDirectory, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && entry.name.endsWith(".func"),
);

if (functionBundles.length === 0) {
  throw new Error(`No Vercel function bundles found in: ${functionsDirectory}`);
}

for (const bundle of functionBundles) {
  const targetDirectory = join(functionsDirectory, bundle.name, "var");
  mkdirSync(targetDirectory, { recursive: true });
  copyFileSync(source, join(targetDirectory, "dashboard.sqlite"));
}

console.log(`Packaged dashboard.sqlite in ${functionBundles.length} Vercel function bundle(s).`);
