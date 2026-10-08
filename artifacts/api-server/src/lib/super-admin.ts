import { pool } from "@workspace/db";
import { logger } from "./logger";

export const RESERVED_SUPER_ADMIN_NAME = "עפעס ערענסט";
export const RESERVED_SUPER_ADMIN_ID = 7;

export function isReservedSuperAdminName(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^[?؟\s\u200e\u200f]+/, "");
  return normalized === RESERVED_SUPER_ADMIN_NAME;
}

export async function ensureReservedSuperAdmin() {
  const { rows } = await pool.query(
    `SELECT id, name, nickname, role, status
       FROM users
       WHERE id = $1
       LIMIT 1`,
    [RESERVED_SUPER_ADMIN_ID],
  );

  const user = rows[0];
  if (!user) {
    logger.error({ userId: RESERVED_SUPER_ADMIN_ID }, "Reserved super-admin user ID was not found");
    return;
  }

  if (!isReservedSuperAdminName(user.name) && !isReservedSuperAdminName(user.nickname)) {
    logger.error(
      { userId: user.id, name: user.name, nickname: user.nickname },
      "Reserved super-admin ID exists but the display name does not match; promotion skipped",
    );
    return;
  }

  if (user.role !== "super_admin") {
    await pool.query("UPDATE users SET role='super_admin' WHERE id=$1", [user.id]);
    logger.info({ userId: user.id }, "Reserved account promoted to super_admin");
  } else {
    logger.info({ userId: user.id }, "Reserved super-admin account verified");
  }
}
