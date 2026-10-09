import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, supportMessagesTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();
const TYPE = "__membership_gate_config__";
const SECTIONS = new Set(["forum","volunteer","help","projects","groups","connections","communications","minyans","united","profile","general"]);
const LANGS = new Set(["yi", "en"]);
const THEMES = new Set(["warm", "gold", "blue", "plain"]);
const LAYOUTS = new Set(["centered","split","minimal"]);
type GateDesign = {
  title: string; subtitle: string; body: string; footnote: string;
  joinText: string; signInText: string; theme: string; layout: string;
  imageUrl: string; showIcon: boolean;
};
type StoredGate = { draft: GateDesign | null; published: GateDesign | null; updatedAt: string; publishedAt: string | null; updatedBy: number | null };
function key(section: string, lang: string) { return `${section}:${lang}`; }
function valid(section: string, lang: string) { return SECTIONS.has(section) && LANGS.has(lang); }
function textField(v: unknown, max: number) { return typeof v === "string" ? v.trim().slice(0,max) : ""; }
function validate(raw: unknown): GateDesign | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const x = raw as Record<string,unknown>;
  const theme = String(x.theme || "warm"), layout = String(x.layout || "centered");
  if (!THEMES.has(theme) || !LAYOUTS.has(layout) || typeof x.showIcon !== "boolean") return null;
  const title = textField(x.title,120), subtitle = textField(x.subtitle,200), body = textField(x.body,2000);
  const joinText = textField(x.joinText,70), signInText = textField(x.signInText,70);
  const footnote = textField(x.footnote,400), imageUrl = textField(x.imageUrl,500);
  if (!title || !body || !joinText || !signInText) return null;
  if (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl)) return null;
  return { title, subtitle, body, joinText, signInText, footnote, theme, layout, imageUrl, showIcon: x.showIcon };
}
const fallback = (section: string, lang: string): GateDesign => {
  const yi = lang === "yi";
  const subject: Record<string,[string,string]> = {
    forum: ["עסקנים פארום", "Askanim Forum"],
    volunteer: ["ווערן אן עסקן", "Become a Volunteer"],
    help: ["בעטן הילף", "Request Assistance"],
    projects: ["קהילה פראיעקטן", "Community Projects"],
    groups: ["גרופעס", "Member Groups"],
    connections: ["פארבינדונגען", "Member Connections"],
    communications: ["קאמוניקאציע", "Communications"],
    minyans: ["מנינים", "Minyan Directory"],
    united: ["אחדות און חסד", "United In Kindness"],
    profile: ["מיין פראפיל", "My Profile"],
    general: ["מעמבער־צוטריט", "Member Access"],
  };
  const name = subject[section] || subject.general;
  return {
    title: yi ? `ברוכים הבאים צום ${name[0]}` : `Welcome to ${name[1]}`,
    subtitle: yi ? "די גבהה קהילה" : "The Gavhah Community",
    body: yi
      ? "כדי צו קענען אנטייל נעמען אין דעם אפטיילונג דארף מען זיין א רעגיסטרירטער מעמבער. מעמבערשיפ איז אומזיסט. נאכן זיך אריינשרייבן וועסטו קענען ווייטערגיין."
      : "To participate in this section, please sign in or join the community. Membership is free; you can continue after joining.",
    footnote: yi ? "היים־אדרעס איז אפטיאָנעל. קיין פאסט וועט נישט געשיקט ווערן אן באזונדערע רשות." : "A home address is optional; postal mail is never sent without separate permission.",
    joinText: yi ? "ווערן א מעמבער — אומזיסט" : "Join Free",
    signInText: yi ? "איך בין שוין א מעמבער" : "Already a member? Sign in",
    theme: "warm", layout: "centered", imageUrl: "", showIcon: true,
  };
};
async function stored(section: string, lang: string) {
  const [row] = await db.select().from(supportMessagesTable)
    .where(and(eq(supportMessagesTable.type, TYPE), eq(supportMessagesTable.subject, key(section,lang))))
    .orderBy(desc(supportMessagesTable.id)).limit(1);
  let data: StoredGate | null = null;
  if (row) {
    try {
      const parsed = JSON.parse(row.message);
      data = {
        published: validate(parsed.published),
        draft: validate(parsed.draft),
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        publishedAt: typeof parsed.publishedAt === "string" ? parsed.publishedAt : null,
        updatedBy: Number.isSafeInteger(parsed.updatedBy) ? parsed.updatedBy : null,
      };
    } catch { /* defaults on old malformed record */ }
  }
  return { row, data: data ?? { draft: null, published: null, updatedAt: "", publishedAt: null, updatedBy: null } };
}
router.get("/membership-gates/:section/:lang", async (req,res): Promise<void> => {
  const section=String(req.params.section),lang=String(req.params.lang);
  if (!valid(section,lang)) { res.status(404).json({error:"Unknown membership page"}); return; }
  const item=await stored(section,lang);
  res.setHeader("Cache-Control","no-store");
  res.json(item.data.published ?? fallback(section,lang));
});
router.get("/admin/membership-gates/:section/:lang",requireAdmin,async(req,res):Promise<void>=>{
  const section=String(req.params.section),lang=String(req.params.lang);
  if(!valid(section,lang)){res.status(404).json({error:"Unknown membership page"});return;}
  const {data}=await stored(section,lang);
  res.setHeader("Cache-Control","private, no-store");
  res.json({ ...data, fallback: fallback(section,lang) });
});
router.put("/admin/membership-gates/:section/:lang",requireAdmin,async(req,res):Promise<void>=>{
  const section=String(req.params.section),lang=String(req.params.lang);
  if(!valid(section,lang)){res.status(404).json({error:"Unknown membership page"});return;}
  const draft=validate(req.body);
  if(!draft){res.status(400).json({error:"Title, body, buttons and valid design fields are required"});return;}
  const {row,data}=await stored(section,lang);
  const next:StoredGate={...data,draft,updatedAt:new Date().toISOString(),updatedBy:getSessionUserId(req)!};
  if(row)await db.update(supportMessagesTable).set({message:JSON.stringify(next)}).where(eq(supportMessagesTable.id,row.id));
  else await db.insert(supportMessagesTable).values({
    userId:getSessionUserId(req)!,name:"Membership Gate Editor",email:"membership@internal.invalid",
    type:TYPE,subject:key(section,lang),message:JSON.stringify(next),status:"resolved",
  });
  res.json({saved:true,published:false});
});
router.post("/admin/membership-gates/:section/:lang/publish",requireAdmin,async(req,res):Promise<void>=>{
  const section=String(req.params.section),lang=String(req.params.lang);
  if(!valid(section,lang)){res.status(404).json({error:"Unknown membership page"});return;}
  const {row,data}=await stored(section,lang);
  if(!row||!data.draft){res.status(409).json({error:"Save a draft before publishing"});return;}
  const next:StoredGate={...data,published:data.draft,publishedAt:new Date().toISOString(),updatedBy:getSessionUserId(req)!};
  await db.update(supportMessagesTable).set({message:JSON.stringify(next)}).where(eq(supportMessagesTable.id,row.id));
  res.json({published:true});
});
export default router;
