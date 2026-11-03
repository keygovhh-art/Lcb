// Gavhah homepage department order (2026-11-02).
// The live Cloudflare Worker v104 uses these keypad aliases. Never renumber the
// retained old submenu paths or the Olam Hachesed SignalWire hotline.
export const gavhahHomepageHotlineDivisions = [
 {number:1,name:"Chesed News Center",website:"/news",phonePath:"11"},
 {number:2,name:"Askanim Discussion Center",website:"/forum",phonePath:"9702"},
 {number:3,name:"Community Projects & Private Askanim Matching",website:"/directory",phonePath:"9703"},
 {number:4,name:"United In Kindness",website:"/united",phonePath:"9704"},
 {number:5,name:"Olam Hachesed Communications",website:"/communications",phonePath:"159"},
 {number:6,name:"Today's Cause",website:"/charity",phonePath:"9706"},
 {number:7,name:"Minyan Directory",website:"/minyans",phonePath:"17"},
 {number:8,name:"Group Center",website:"/groups",phonePath:"9708"},
 {number:9,name:"My Askanus",website:"/my",phonePath:"12"},
 {number:10,name:"Office Reservations",website:"/reservations",phonePath:"172",via:"77 then 1"},
 {number:11,name:"System Center",website:"/system",phonePath:"18",via:"77 then 2"},
 {number:12,name:"Koach Harabim",website:"/dashboard",phonePath:"19",via:"77 then 3"}
] as const;
// Direct hotline aliases inspired by the signed-in mobile drawer, not a replacement
// for the twelve homepage departments above; all older paths remain available.
export const gavhahMobileDrawerPhoneAliases = [
 {dial:"11",name:"Search",website:"/search",path:"97190"},
 {dial:"12",name:"Notifications",website:"/notifications",path:"97181"},
 {dial:"13",name:"My Connections",website:"/connections",path:"97193"},
 {dial:"14",name:"Koach Harabim Dashboard",website:"/dashboard",path:"19"},
 {dial:"15",name:"My Profile",website:"/profile",path:"182"},
] as const;
// To dial direct two-digit codes on Yemot, enter both digits and finish #.
// 11 has category-by-ID lookup (not unrestricted keyboard text search).
// 13 provides member-only connection case status; no contact disclosure or
// consent actions (both require explicit separate approval through Gavhah).
export const gavhahPhoneSearchSubmenu={
 "1":"115", // news by number
 "2":"166", // discussions by number
 "3":"155", // charity by number
 "4":"167", // groups by number
 "5":"173"  // minyans by number
} as const;
export const gavhahMainPhoneShortcuts = {
 "0": "official Gavhah member registration (old internal path 185)",
 "77": "More departments, all remaining older contact/call/community tools",
 "88": "advanced My Askanus keypad on Yemot only",
 "4444": "Campaign Center, separate protected menu",
 "*": "back"
} as const;
// These existing legacy paths remain reachable through the More submenu 77:
// 77->4=13 contacts, 77->5=14 calling, 77->6=15 kindness,
// 77->7=16 community, 77->8=17 minyans, 77->9=12 My Askanus.
export const gavhahMorePhoneAliases = {
 "1":"172","2":"18","3":"19","4":"13","5":"14",
 "6":"15","7":"16","8":"17","9":"12"
} as const;
export const gavhahWebsitePhoneVirtualMenus = {
 "9702":{"1":"97021"}, // Discussion: wait-to-listen; press 1 for options only
 "97021":{"1":"970211"}, // Record a discussion, then #, preview, publish/redo/discard/cancel/continue
 "9703":{"1":"97031"}, // Approved projects play automatically; 1 = options
 "97031":{"1":"970311","2":"970312"}, // 1 private staff list; 2 project for approval
 "9704":{"1":"154","2":"152","3":"153","4":"164","5":"161"},
 "9706":{"1":"151","2":"155","3":"154"},
 "9708":{"1":"161","2":"167","3":"164","4":"162"},
 "9777":gavhahMorePhoneAliases
} as const;
// In the live Worker, the new main keypad maps to existing backend paths;
// this does not delete or rename source feature routes, plans, or data.

// 2026-11-02 Cloudflare v108: system center phone notifications route, shared
// with /api/notifications and the existing public.notifications table.
// Opening from main keypad: 77 -> 2 -> 1. No caller-ID-based authentication.
export const gavhahTelephoneNotifications = {
  access: ["77","2","1"],
  centerPath:"97181",
  menu:{
    "1":"971811", // unread
    "2":"971812", // all
    "3":"971813", // mark all read, press 1 twice to confirm
    "4":"971814", // categories 1-5
    "5":"182", // account / profile
    "9":"181", // original notification reader (preserved)
  },
  types:{
    "1":["comment","reply"],
    "2":["cause_support","charity_update"],
    "3":["group_activity","project_join","volunteer_match"],
    "4":["announcement"],
    "5":["help_response"]
  },
  listKeys:{next:"1",previous:"2",relatedItem:"3",markReadDoubleConfirm:"5",center:"9",back:"*"},
  requireVerifiedGavhahMember:true,
  sourceOfTruth:"public.notifications",
} as const;
