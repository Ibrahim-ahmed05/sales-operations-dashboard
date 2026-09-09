import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

// Vercel executes server functions from a generated directory, so the process
// working directory is not guaranteed to be the project root. Resolve the
// bundled seed database from both locations used by local and traced builds.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const bundledCandidates = [
  resolve("var/dashboard.sqlite"),
  resolve(moduleDir, "../var/dashboard.sqlite"),
  resolve(moduleDir, "../../var/dashboard.sqlite"),
  resolve(moduleDir, "../../../var/dashboard.sqlite"),
];
const bundledDatabase =
  bundledCandidates.find((candidate) => existsSync(candidate)) || bundledCandidates[0];
const vercelDatabase = join(tmpdir(), "meridian-dashboard.sqlite");
if (process.env.VERCEL && !existsSync(vercelDatabase))
  copyFileSync(bundledDatabase, vercelDatabase);
export const db = new DatabaseSync(
  process.env.DASHBOARD_DB || (process.env.VERCEL ? vercelDatabase : bundledDatabase),
);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT CHECK(role IN ('Admin','Manager','Viewer')),salt TEXT NOT NULL,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const one = (sql, ...params) => db.prepare(sql).get(...params);
export function addUser(email, name, role, password) {
  if (!["Admin", "Manager", "Viewer"].includes(role)) throw Error("Invalid role");
  if (password.length < 14) throw Error("Use at least 14 characters");
  const salt = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO users(email,name,role,salt,password_hash) VALUES (?,?,?,?,?)").run(
    email.toLowerCase(),
    name,
    role,
    salt,
    scryptSync(password, salt, 64).toString("hex"),
  );
}
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function authenticate(request) {
  const token = (request.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("meridian_session="))
    ?.split("=")[1];
  if (!token) return null;
  return (
    one(
      "SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      hash(token),
      Date.now(),
    ) || null
  );
}
export function login(email, password) {
  const u = one("SELECT * FROM users WHERE email=?", String(email).toLowerCase());
  const actual = scryptSync(String(password), u?.salt || "nonexistent-user-timing-salt", 64);
  if (!u || !timingSafeEqual(actual, Buffer.from(u.password_hash, "hex"))) return null;
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    hash(token),
    u.id,
    Date.now() + 8 * 3600000,
  );
  return token;
}
export function logout(request) {
  const token = (request.headers.get("cookie") || "").match(
    /(?:^|;\s*)meridian_session=([^;]+)/,
  )?.[1];
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
}
