import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.includes(":")) return false;
  const colonIdx = stored.indexOf(":");
  const salt = stored.slice(0, colonIdx);
  const hash = stored.slice(colonIdx + 1);
  if (!salt || !hash) return false;
  try {
    const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer;
    const storedHash = Buffer.from(hash, "hex");
    if (derivedHash.length !== storedHash.length) return false;
    return timingSafeEqual(derivedHash, storedHash);
  } catch {
    return false;
  }
}
