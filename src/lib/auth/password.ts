import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(plain: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, encoded: string) {
  const [algo, salt, storedHex] = encoded.split(":");
  if (algo !== "scrypt" || !salt || !storedHex) return false;
  const derived = scryptSync(plain, salt, KEY_LEN);
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(derived, stored);
}
