import {Router} from "express";
import {db} from "@workspace/db";
import {hotlineMailboxItems} from "@workspace/db/schema";
import {and,desc,eq,isNull,sql} from "drizzle-orm";
import {requireAuth,getSessionUserId} from "../middlewares/auth";

// Strictly own authenticated WEB mailbox. Future IVR adapter must authenticate
// the caller separately and never trust an unverified caller-ID alone.
const router=Router();
router.get("/askanus/hotline-mailbox",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const [items,unread]=await Promise.all([
    db.select().from(hotlineMailboxItems).where(eq(hotlineMailboxItems.userId,userId))
      .orderBy(desc(hotlineMailboxItems.createdAt)).limit(100),
    db.select({count:sql<number>`count(*)::int`}).from(hotlineMailboxItems)
      .where(and(eq(hotlineMailboxItems.userId,userId),isNull(hotlineMailboxItems.readAt))),
  ]);
  res.setHeader("Cache-Control","private, no-store");
  res.json({items,unreadCount:unread[0]?.count??0,
    internalInbox:true,providerPlaybackConnected:false,
    outboundCalls:0,smsSent:0});
});
router.post("/askanus/hotline-mailbox/:id/read",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:"Invalid inbox entry"});return;}
  const [row]=await db.update(hotlineMailboxItems).set({readAt:new Date()}).where(and(
    eq(hotlineMailboxItems.id,id),eq(hotlineMailboxItems.userId,userId)
  )).returning({id:hotlineMailboxItems.id,readAt:hotlineMailboxItems.readAt});
  if(!row){res.status(404).json({error:"Inbox entry not found"});return;}
  res.setHeader("Cache-Control","private, no-store");
  res.json({item:row});
});
export default router;
