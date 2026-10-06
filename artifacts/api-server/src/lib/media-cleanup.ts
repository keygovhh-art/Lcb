import { eq } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";

export function mediaIdFromUrl(value?: string | null): number | null {
  if (!value) return null;
  const match = String(value).match(/^\/api\/media\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export async function deleteManagedMediaUrl(value?: string | null) {
  const id = mediaIdFromUrl(value);
  if (!id) return;
  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
}
