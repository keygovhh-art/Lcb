import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";
import { requireAuth, getSessionUserId, getSessionUserRole } from "../middlewares/auth";

const router: IRouter = Router();
const MAX_BYTES = 1_500_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function isStaff(role?: string) {
  return role === "admin" || role === "moderator";
}

router.post("/media/images", requireAuth, async (req, res): Promise<void> => {
  const { fileName, mimeType, dataBase64 } = req.body ?? {};

  if (!fileName || !mimeType || !dataBase64) {
    res.status(400).json({ error: "fileName, mimeType, and dataBase64 are required" });
    return;
  }
  if (!ALLOWED_TYPES.has(String(mimeType))) {
    res.status(400).json({ error: "Unsupported image type" });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(String(dataBase64), "base64");
  } catch {
    res.status(400).json({ error: "Invalid image data" });
    return;
  }

  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    res.status(413).json({ error: "Image is too large after compression" });
    return;
  }

  const [asset] = await db.insert(mediaAssetsTable).values({
    ownerId: getSessionUserId(req)!,
    fileName: String(fileName).slice(0, 180),
    mimeType: String(mimeType),
    dataBase64: String(dataBase64),
    byteSize: bytes.length,
  }).returning({
    id: mediaAssetsTable.id,
    fileName: mediaAssetsTable.fileName,
    mimeType: mediaAssetsTable.mimeType,
    byteSize: mediaAssetsTable.byteSize,
  });

  res.status(201).json({
    ...asset,
    url: `/api/media/${asset.id}`,
  });
});

router.get("/media/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }

  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  if (!asset) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const bytes = Buffer.from(asset.dataBase64, "base64");
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(bytes);
});

router.delete("/media/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  if (!asset) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const userId = getSessionUserId(req)!;
  if (asset.ownerId !== userId && !isStaff(getSessionUserRole(req))) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  res.sendStatus(204);
});

export default router;
