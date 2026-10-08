import { pool } from "@workspace/db";
import { logger } from "./logger";

export const RESERVED_SUPER_ADMIN_NAME = "עפעס ערענסט";

export async function ensureReservedSuperAdmin() {
  const { rows } = await pool.query(
    `SELECT id, name, nickname, role, status
       FROM users
       WHERE name = $1 OR nickname = $1
       ORDER BY id ASC`,
    [RESERVED_SUPER_ADMIN_NAME],
  );

  if (rows.length === 0) {
    logger.warn({ account: RESERVED_SUPER_ADMIN_NAME }, "Reserved super-admin account was not found");
    return;
  }

  if (rows.length !== 1) {
    logger.error(
      { account: RESERVED_SUPER_ADMIN_NAME, matchingIds: rows.map(row => row.id) },
      "Super-admin promotion skipped because the reserved account name is not unique",
    );
    return;
  }

  const user = rows[0];
  if (user.role !== "super_admin") {
    await pool.query("UPDATE users SET role='super_admin' WHERE id=$1", [user.id]);
    logger.info({ userId: user.id }, "Reserved account promoted to super_admin");
  }
}
