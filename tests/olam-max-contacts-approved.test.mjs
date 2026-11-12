import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const api=read("artifacts/api-server/src/routes/olam-contacts-approved.ts");
const phone=read("artifacts/api-server/src/lib/olam-contacts-ivr.ts");
const post=read("artifacts/api-server/src/routes/olam-postcall-approved.ts");
const caller=read("artifacts/gavhah/src/components/communications/olam-approved-calling-panel.tsx");
const db=read("migrations/20261112_olam_contacts_approved.sql");
const triggers=read("migrations/20261112_olam_contacts_triggers.sql");
const calendar=read("artifacts/api-server/src/lib/olam-contact-calendar.ts");

test("renamed Contacts has all requested member-safe categories and normal back key",()=>{
 assert.match(api,/title:"קאנטאקט'ס"/);
 assert.match(api,/keys:\{"1":"list","2":"create","3":"search","4":"eligible","5":"callbacks","6":"pledge_pending"/);
 for(const x of ["warm","do_not_call","missed","donations","no_answer","not_interested","asked_no_more","pledges","other","unreported","spoke"]){
  assert.match(api,new RegExp("\\b"+x+"\\b"));
  assert.match(phone,new RegExp("\\b"+x+"\\b"));
 }
 assert.match(phone,/digit==="\*"/);
 assert.match(phone,/digit==="#"/);
 assert.doesNotMatch(phone,/digit==="0".*(back|root)/);
});
test("every contact has stable per-member ID, no-name auto insert, archival never deletes history",()=>{
 assert.match(db,/contact_ref/);
 assert.match(db,/UNIQUE INDEX IF NOT EXISTS communication_contacts_owner_ref_unique/);
 assert.match(db,/max_contact_call_events/);
 assert.match(triggers,/INSERT INTO public.communication_contacts\(user_id,name,phone\) VALUES\(NEW.user_id,''/);
 assert.match(triggers,/olam_max_append_call_event/);
 assert.match(api,/archived_at=now\(\)/);
 assert.doesNotMatch(api,/DELETE FROM public.communication_contacts/);
});
test("per contact search includes any historic date, Hebrew calendar and stable ID",()=>{
 assert.match(api,/max_contact_call_events e/);
 assert.match(api,/max_call_sessions s/);
 assert.match(api,/c\.contact_ref=\$4/);
 assert.match(calendar,/Intl.DateTimeFormat\("en-u-ca-hebrew"/);
 assert.match(calendar,/timeZone:"America\/New_York"/);
 assert.match(calendar,/www.hebcal.com\/hebcal/);
 assert.match(phone,/olamHebrewToCivil/);
});
test("repeat/inbound call prompts cannot invent a purpose or a no-answer result",()=>{
 assert.match(post,/incomingRequiresExplicitPurpose:row\.direction==="inbound"/);
 assert.match(post,/entryStatus:decision==="skip"\?"not_entered":"awaiting_answer"/);
 assert.match(post,/autoSelectedPurpose:false/);
 assert.match(post,/no_answer/);
 assert.match(caller,/useState\(""\),\[moneyKind,setMoneyKind\]=useState\("none"\)/);
 assert.match(caller,/postCallName/);
});
test("missed incoming calls include signed SignalWire return-alert history",()=>{
 const inbound=read("migrations/20261112_olam_contacts_inbound_calls.sql");
 assert.match(inbound,/olam_max_return_call_contact_created/);
 assert.match(inbound,/RETURN NEW/);
 assert.match(inbound,/olam_max_return_call_contact/);
 assert.match(inbound,/\x27return-call:\x27\|\|NEW\.id/);
 assert.match(inbound,/\x27inbound\x27,\x27signalwire\x27,\x27\x27/);
 for(const script of [api,phone]){
  assert.match(script,/max_return_calls rc JOIN public\.max_return_alerts a/);
  assert.match(script,/a\.kind IN \(\x27missed\x27,\x27voicemail\x27,\x27busy\x27,\x27yemot\x27\)/);
 }
});
test("recontact never becomes an automatic call; reports remain append-only",()=>{
 assert.match(db,/max_contact_recontact_plans/);
 assert.match(triggers,/olam_max_advance_contact_cadence/);
 assert.match(phone,/max_contact_recontact_plans/);
 assert.match(db,/CREATE TABLE IF NOT EXISTS public\.max_contact_call_events/);
 assert.doesNotMatch(phone,/placeOlamMaxOutboundCall/);
});
