import { Router, type IRouter } from "express";
import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import { db, charitiesTable, donationsTable, charityNativeDonationSettingsTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";
import { resolveMemberDisplayName } from "../lib/user-display";
import { logActivity } from "../lib/activity";
import { deleteManagedMediaUrl } from "../lib/media-cleanup";
import {
  isCampaignState, parseFutureSchedule, validatePhone, validateExtension,
  validateDonationUrl, validateButtonText, isButtonStyle, isButtonLayout,
} from "../lib/charity-editor";

import { NATIVE_CHECKOUT_INTEGRATED, nativeDonationDefaults, validateNativePreferences, type NativeDonationConfiguration } from "../lib/native-charity-donations";

const router: IRouter = Router();

async function nativeConfig(): Promise<NativeDonationConfiguration> {
  const [row] = await db.select().from(charityNativeDonationSettingsTable)
    .where(eq(charityNativeDonationSettingsTable.id, 1)).limit(1);
  return row ?? nativeDonationDefaults;
}

const publicCampaign = () => or(
  and(eq(charitiesTable.publicationState, "live"), eq(charitiesTable.isActive, true)),
  and(eq(charitiesTable.publicationState, "scheduled"), lte(charitiesTable.scheduledAt, new Date())),
);
const setNoStore = (res: import("express").Response) => res.setHeader("Cache-Control", "no-store");

function validatePayload(input: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  if ("name" in input) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 240)
      throw new Error("Campaign name is required (max 240 characters)");
    props.name = input.name.trim();
  }
  if ("description" in input) {
    if (typeof input.description !== "string" || !input.description.trim() || input.description.length > 30_000)
      throw new Error("Campaign description is required (max 30,000 characters)");
    props.description = input.description.trim();
  }
  if ("successStories" in input) props.successStories =
    input.successStories ? String(input.successStories).trim().slice(0, 5000) : null;
  if ("imageUrl" in input) {
    const value = input.imageUrl;
    if (value !== null && value !== "" && (typeof value !== "string" || value.length > 2000))
      throw new Error("Invalid campaign image");
    props.imageUrl = value ? String(value) : null;
  }
  if ("goalAmount" in input) {
    const goal = Number(input.goalAmount);
    if (!Number.isSafeInteger(goal) || goal < 0) throw new Error("Goal must be a nonnegative whole-dollar amount");
    props.goalAmount = goal;
  }
  if ("phoneNumber" in input) props.phoneNumber = validatePhone(input.phoneNumber);
  if ("phoneExtension" in input) props.phoneExtension = validateExtension(input.phoneExtension);
  if ("phoneButtonText" in input) props.phoneButtonText = validateButtonText(input.phoneButtonText);
  if ("donationUrl" in input) props.donationUrl = validateDonationUrl(input.donationUrl);
  if ("linkButtonText" in input) props.linkButtonText = validateButtonText(input.linkButtonText);
  if ("buttonStyle" in input) {
    if (!isButtonStyle(input.buttonStyle)) throw new Error("Unknown button design");
    props.buttonStyle = input.buttonStyle;
  }
  if ("nativeDonationEnabled" in input) {
    if (typeof input.nativeDonationEnabled !== "boolean") throw new Error("Own donation setting must be true or false");
    props.nativeDonationEnabled = input.nativeDonationEnabled;
  }
  if ("nativeDonationButtonText" in input) props.nativeDonationButtonText = validateButtonText(input.nativeDonationButtonText);
  if ("nativeDonationButtonStyle" in input) {
    if (!isButtonStyle(input.nativeDonationButtonStyle)) throw new Error("Invalid own donation design");
    props.nativeDonationButtonStyle = input.nativeDonationButtonStyle;
  }
  if ("buttonLayout" in input) {
    if (!isButtonLayout(input.buttonLayout)) throw new Error("Unknown button layout");
    props.buttonLayout = input.buttonLayout;
  }
  if ("isTodaysFeatured" in input && typeof input.isTodaysFeatured !== "boolean")
    throw new Error("Featured choice must be true or false");
  if ("publicationState" in input && !isCampaignState(input.publicationState))
    throw new Error("Unknown publication state");
  return props;
}

const currentFeaturedToClear = () => and(
  eq(charitiesTable.isTodaysFeatured, true),
  or(
    eq(charitiesTable.publicationState, "live"),
    and(eq(charitiesTable.publicationState, "scheduled"), lte(charitiesTable.scheduledAt, new Date())),
  ),
);

/** Admin preferences only. Native processing is unavailable until a real integration exists. */
router.get("/admin/charity/native-settings", requireAdmin, async (_req, res): Promise<void> => {
  setNoStore(res);
  res.json({ ...(await nativeConfig()), integrationReady: NATIVE_CHECKOUT_INTEGRATED });
});

router.patch("/admin/charity/native-settings", requireAdmin, async (req, res): Promise<void> => {
  setNoStore(res);
  let settings: NativeDonationConfiguration;
  try {
    settings = validateNativePreferences(
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {},
      await nativeConfig(),
    );
  } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const [saved] = await db.insert(charityNativeDonationSettingsTable).values({
    id: 1, ...settings, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: charityNativeDonationSettingsTable.id,
    set: { ...settings, updatedAt: new Date() },
  }).returning();
  const actor = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("charity", "Updated own-donation preferences (checkout remains disabled until integrated)", actor);
  res.json({ ...saved, integrationReady: NATIVE_CHECKOUT_INTEGRATED });
});

router.get("/charity/today", async (_req, res): Promise<void> => {
  setNoStore(res);
  const [campaign] = await db.select().from(charitiesTable)
    .where(and(eq(charitiesTable.isTodaysFeatured, true), publicCampaign()))
    .orderBy(desc(charitiesTable.featuredFrom), desc(charitiesTable.createdAt)).limit(1);
  if (!campaign) { res.status(404).json({ error: "No featured charity today" }); return; }
  res.json(campaign);
});

router.get("/charity", async (_req, res): Promise<void> => {
  setNoStore(res);
  const all = await db.select().from(charitiesTable).where(publicCampaign()).orderBy(desc(charitiesTable.createdAt));
  res.json(all);
});

router.get("/admin/charity", requireAdmin, async (_req, res): Promise<void> => {
  setNoStore(res);
  const all = await db.select().from(charitiesTable).orderBy(desc(charitiesTable.createdAt));
  res.json(all);
});

router.post("/charity", requireAdmin, async (req, res): Promise<void> => {
  const input = (req.body || {}) as Record<string, unknown>;
  let safe: Record<string, unknown>;
  try { safe = validatePayload(input); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  if (!safe.name || !safe.description) { res.status(400).json({ error: "Name and description required" }); return; }
  const publicationState = input.publicationState === undefined ? "live" : input.publicationState;
  if (!isCampaignState(publicationState)) { res.status(400).json({ error: "Invalid publication state" }); return; }
  if (publicationState === "archived") { res.status(400).json({ error: "Create in queue instead of archived" }); return; }
  const scheduledAt = publicationState === "scheduled" ? parseFutureSchedule(input.scheduledAt) : null;
  if (publicationState === "scheduled" && !scheduledAt) {
    res.status(400).json({ error: "Choose a future time (including timezone) to schedule this campaign" }); return;
  }
  const featured = input.isTodaysFeatured === true && publicationState !== "queued";
  const now = new Date();
  const [created] = await db.transaction(async tx => {
    if (featured && publicationState === "live") {
      await tx.update(charitiesTable).set({ isTodaysFeatured: false }).where(currentFeaturedToClear());
    }
    return tx.insert(charitiesTable).values({
      ...safe,
      goalAmount: (safe.goalAmount ?? 0) as number,
      name: safe.name as string,
      description: safe.description as string,
      publicationState,
      scheduledAt,
      isActive: publicationState === "live",
      isTodaysFeatured: featured,
      featuredFrom: featured ? (scheduledAt ?? now) : null,
    }).returning();
  });
  const actor = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("charity", `Created ${publicationState} charity campaign "${created.name}"`, actor);
  res.status(201).json(created);
});

router.get("/charity/:id", async (req, res): Promise<void> => {
  setNoStore(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid campaign" }); return; }
  const [item] = await db.select().from(charitiesTable)
    .where(and(eq(charitiesTable.id, id), publicCampaign())).limit(1);
  if (!item) { res.status(404).json({ error: "Campaign not published" }); return; }
  res.json(item);
});

router.patch("/charity/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid campaign" }); return; }
  const [existing] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
  const input = (req.body || {}) as Record<string, unknown>;
  let changes: Record<string, unknown>;
  try { changes = validatePayload(input); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  let state = existing.publicationState;
  if ("publicationState" in input) state = input.publicationState as string;
  else if ("isActive" in input) state = input.isActive === false ? "archived" : "live";
  if (!isCampaignState(state)) { res.status(400).json({ error: "Invalid publication state" }); return; }
  let scheduledAt: Date | null = null;
  if (state === "scheduled") {
    const candidate = input.scheduledAt ?? (existing.publicationState === "scheduled" ? existing.scheduledAt?.toISOString() : null);
    // If an existing schedule has passed, editing a description must still work;
    // rescheduling via an explicit date must always be in the future.
    if (input.scheduledAt !== undefined || !existing.scheduledAt || existing.scheduledAt > new Date()) {
      scheduledAt = parseFutureSchedule(candidate);
    } else {
      scheduledAt = existing.scheduledAt;
    }
    if (!scheduledAt) { res.status(400).json({ error: "A future scheduled date is required" }); return; }
  }
  const now = new Date();
  let featured = input.isTodaysFeatured === undefined ? existing.isTodaysFeatured : input.isTodaysFeatured === true;
  if (state === "queued" || state === "archived") featured = false;
  const newlyFeatured = featured && (input.isTodaysFeatured === true || existing.publicationState !== state);
  Object.assign(changes, {
    publicationState: state, scheduledAt, isActive: state === "live",
    isTodaysFeatured: featured,
    featuredFrom: featured ?
      state === "scheduled" ? scheduledAt :
      newlyFeatured ? now : existing.featuredFrom ?? existing.createdAt
      : null,
  });
  const [updated] = await db.transaction(async tx => {
    if (featured && state === "live" && newlyFeatured) {
      await tx.update(charitiesTable).set({ isTodaysFeatured: false }).where(currentFeaturedToClear());
    }
    return tx.update(charitiesTable).set(changes).where(eq(charitiesTable.id, id)).returning();
  });
  if (input.imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== updated.imageUrl) {
    await deleteManagedMediaUrl(existing.imageUrl);
  }
  const actor = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("charity", `Updated charity "${updated.name}" (${state})`, actor);
  res.json(updated);
});

router.post("/charity/:id/donate", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const donorName = req.body?.donorName ? String(req.body.donorName).trim().slice(0, 160) : null;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    res.status(400).json({ error: "Amount must be a positive whole-dollar number" }); return;
  }
  const [campaign] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const [donation] = await db.transaction(async tx => {
    const inserted = await tx.insert(donationsTable).values({ charityId: id, amount, donorName }).returning();
    await tx.update(charitiesTable).set({ raisedAmount: sql`${charitiesTable.raisedAmount} + ${amount}` })
      .where(eq(charitiesTable.id, id));
    return inserted;
  });
  const actor = await resolveMemberDisplayName(getSessionUserId(req)!);
  await logActivity("donation", `Recorded a $${amount} verified offline donation for "${campaign.name}"`, actor);
  res.status(201).json(donation);
});

export default router;
