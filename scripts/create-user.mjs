#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function usage() {
  console.log("Usage:");
  console.log("  DATABASE_URL=... node scripts/create-user.mjs --email you@example.com --password '***' [--id <uuid>]");
}

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return (process.argv[idx + 1] || "").trim();
}

function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function main() {
  const connectionString = (process.env.DATABASE_URL || "").trim();
  const email = parseArg("--email").toLowerCase();
  const password = parseArg("--password");
  const id = parseArg("--id");

  if (!connectionString || !email || !password) {
    usage();
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const passwordHash = hashPassword(password);
    if (id) {
      await pool.query(
        `
        insert into public.app_users (id, email, password_hash)
        values ($1::uuid, $2, $3)
        on conflict (id) do update
          set email = excluded.email,
              password_hash = excluded.password_hash,
              updated_at = timezone('utc', now())
        `,
        [id, email, passwordHash],
      );
      console.log(`Upserted user with fixed id: ${id}`);
    } else {
      const res = await pool.query(
        `
        insert into public.app_users (email, password_hash)
        values ($1, $2)
        returning id
        `,
        [email, passwordHash],
      );
      console.log(`Created user id: ${res.rows[0].id}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
