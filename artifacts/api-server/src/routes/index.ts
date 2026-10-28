import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminOneTimePasswordReset from "./admin-one-time-password-reset";
import usersRouter from "./users";
import meCreatedContentRouter from "./me-created-content";
import discussionsRouter from "./discussions";
import newsRouter from "./news";
import groupsRouter from "./groups";
import groupAdvancedRouter from "./group-advanced";
import groupPlatformControlRouter from "./group-platform-control";
import minyansRouter from "./minyans";
import volunteersRouter from "./volunteers";
import charityRouter from "./charity";
import statsRouter from "./stats";
import platformRouter from "./platform";
import causeSupportersRouter from "./cause-supporters";
import featuredCausesRouter from "./featured-causes";
import communityProjectsRouter from "./community-projects";
import askanusRouter from "./askanus";
import communicationsMaxRouter from "./communications-max";
import communicationsFinanceRouter from "./communications-finance";
import communicationsContactsTransferRouter from "./communications-contacts-transfer";
import communicationsAssistantRouter from "./communications-assistant";
import communicationsConsentRouter from "./communications-consent";
import communicationsRemindersRouter from "./communications-reminders";
import communicationsReportsRouter from "./communications-reports";
import communicationsHistoryRouter from "./communications-history";
import communicationsTodayRouter from "./communications-today";
import communicationsConnectRouter from "./communications-connect";
import socialRouter from "./social";
import adminRouter from "./admin";
import yemotCentralRouter from "./yemot-central";
import yemotVoiceStudioRouter from "./yemot-voice-studio";
import yemotWholePlatformIvr from "./yemot-whole-platform-ivr";
import hotlineMigrationRouter from "./hotline-migration";
import {signalWireNextHotline} from "../lib/signalwire-next-hotline";
import {signalWireSharedHotline} from "../lib/signalwire-shared-ivr";
import newsVoiceRepliesRouter from "./news-voice-replies";
import phoneAccountLinkRouter from "./phone-account-link";
import reservationsRouter from "./reservations";
import supportRouter from "./support";
import memberConnectionsRouter from "./member-connections";
import privateAssistanceRouter from "./private-assistance";
import membershipGatesRouter from "./membership-gates";
import likesRouter from "./likes";
import mediaRouter from "./media";
import searchRouter from "./search";
import siteCopyRouter from "./site-copy";
import systemErrorsRouter from "./system-errors";
import engagementRouter from "./engagement";
import pinnedAnnouncementsRouter from "./pinned-announcements";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminOneTimePasswordReset);
router.use(usersRouter);
router.use(meCreatedContentRouter);
router.use(discussionsRouter);
router.use(newsRouter);
router.use(groupsRouter);
router.use(groupAdvancedRouter);
router.use(groupPlatformControlRouter);
router.use(minyansRouter);
router.use(volunteersRouter);
router.use(charityRouter);
router.use(statsRouter);
router.use(platformRouter);
router.use(causeSupportersRouter);
router.use(featuredCausesRouter);
router.use(communityProjectsRouter);
// MAX/My Askanus changes are session-cookie authenticated. Cross-site requests
// carrying an Origin must be from this host; preserve non-browser API clients.
router.use("/askanus", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    const given = new URL(origin);
    const requestedHost = req.get("x-forwarded-host") || req.get("host");
    if ((given.protocol !== "https:" && given.protocol !== "http:") ||
        !requestedHost || given.host !== requestedHost) {
      res.status(403).json({error:"Cross-origin MAX changes are not permitted"});
      return;
    }
  } catch {
    res.status(403).json({error:"Invalid Origin"});
    return;
  }
  next();
});
router.use(askanusRouter);
router.use(communicationsMaxRouter);
router.use(communicationsFinanceRouter);
router.use(communicationsContactsTransferRouter);
router.use(communicationsAssistantRouter);
router.use(communicationsConsentRouter);
router.use(communicationsRemindersRouter);
router.use(communicationsReportsRouter);
router.use(communicationsHistoryRouter);
router.use(communicationsTodayRouter);
router.use(communicationsConnectRouter);
router.use(socialRouter);
router.use(adminRouter);
router.use(yemotCentralRouter);
router.use(yemotVoiceStudioRouter);
router.use(yemotWholePlatformIvr);
router.use("/admin/hotline-migration",hotlineMigrationRouter);
// Future SignalWire number: TEST ONLY, signed Compatibility cXML POST.
// Existing Yemot root and Campaign Center 4444 remain on their old routes.
router.post("/signalwire/next-ivr",(req,res,next)=>{
  void signalWireNextHotline(req,res).catch(next);
});
// PREVIEW/STAGED: this URL is not assigned to +16056558080 at SignalWire.
// Original provider voice/SMS settings remain unchanged.
router.post("/signalwire/shared-ivr",(req,res,next)=>{
  void signalWireSharedHotline(req,res).catch(next);
});
router.use(newsVoiceRepliesRouter);
router.use(phoneAccountLinkRouter);
router.use(reservationsRouter);
router.use(supportRouter);
router.use(memberConnectionsRouter);
router.use(privateAssistanceRouter);
router.use(membershipGatesRouter);
router.use(likesRouter);
router.use(mediaRouter);
router.use(searchRouter);
router.use(siteCopyRouter);
router.use(systemErrorsRouter);
router.use(engagementRouter);
router.use(pinnedAnnouncementsRouter);

export default router;
