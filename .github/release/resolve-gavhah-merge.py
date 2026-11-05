#!/usr/bin/env python3
"""Resolve exactly the two reviewed conflicts when merging My Askanus v2 into
the Cloudflare Gavhah release candidate. Fails closed on unexpected conflicts.
No secrets, provider settings, or production deployment are touched."""
from pathlib import Path
import re
import subprocess

root=Path.cwd()
expected={
 "artifacts/api-server/src/lib/yemot-api-driven-phone.ts",
 "artifacts/gavhah/src/pages/my/index.tsx",
}
unmerged=set(subprocess.check_output(["git","diff","--name-only","--diff-filter=U"],text=True).splitlines())
if unmerged != expected:
 raise RuntimeError(f"Unexpected merge conflicts: {unmerged}; expected {expected}")
marker=r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [a-f0-9]{40}\n'

def resolve(s,ours_prefix,theirs_prefix,merge_fn):
 matches=list(re.finditer(marker,s,re.S))
 candidates=[m for m in matches if m.group(1).lstrip().startswith(ours_prefix) and m.group(2).lstrip().startswith(theirs_prefix)]
 if len(candidates)!=1:raise RuntimeError(f"Expected one conflict {ours_prefix}, got {len(candidates)}")
 m=candidates[0]
 return s[:m.start()]+merge_fn(m.group(1),m.group(2))+s[m.end():]

p=root/"artifacts/api-server/src/lib/yemot-api-driven-phone.ts"
s=p.read_text()
imp='import {isCommunityPhonePath,groupPhoneDigit,groupPhonePrompt} from "./yemot-community-groups";\n'
if s.count(imp)!=2:raise RuntimeError("Unexpected group bridge import count")
s=s.replace(imp,"",1)
s=resolve(s,"const inputName=","const inputName=",lambda a,b:'''  const inputName=(replyMode||path==="970211"&&readForumVoiceDraft(manualFlash)?.stage==="record"||phone3WantsRecording(path,manualFlash)||phone4InputKind(path,manualFlash)==="record"||phone6InputKind(path,manualFlash)==="record"||minyan7Input(path,manualFlash)==="record"?"rr":phone4InputKind(path,manualFlash)==="amount"||phone4InputKind(path,manualFlash)==="date"||phone6InputKind(path,manualFlash)==="amount"||phone6InputKind(path,manualFlash)==="date"||minyan7Input(path,manualFlash)==="digits"||minyan7Input(path,manualFlash)==="text"?"pn":(path==="125"||path==="128")?"ln":path==="185"?"rg":(path==="115"||path==="161"||isMyAskanusNumericEntry(path)||publicIdSections.has(path))&&!confirmId&&!actionsOpen?"ar":"iv")+step;
''')
s=resolve(s,"if((digit===","if(digit===",
 lambda a,b:a.replace("!isCommunityPhonePath(path)){","!isCommunityPhonePath(path) && !isMyAskanusPath(path)){"))
def combined(a,b):
 return b[b.index("}else if(isMyAskanusPath(path))"):b.index("}else if(isCommunityPhonePath(path))")]+a
s=resolve(s,"}else if(isCommunityPhonePath(path))","}else if(isMyAskanusPath(path))",combined)
s=resolve(s,"let mode:","let mode:",lambda a,b:a.replace('|"registration"=','|"registration"|"pin"='))
s=resolve(s,'if(path!=="141"','if(path!=="141"',lambda a,b:a.replace('if(path!=="141"','if(!isMyAskanusPath(path)&&path!=="141"'))
s=resolve(s,"!feedback&&!dailyNewsSegments.length","!feedback&&path!=",lambda a,b:a.replace("!feedback&&!dailyNewsSegments.length","!feedback&&!dailyNewsSegments.length&&!isMyAskanusPath(path)"))
if re.search(r"^(<<<<<<<|=======|>>>>>>>)",s,re.M):raise RuntimeError("Unresolved phone conflict")
p.write_text(s)

p=root/"artifacts/gavhah/src/pages/my/index.tsx"
s=p.read_text()
s=resolve(s,"import { PhoneAccountLink }","",lambda a,b:a.replace('import { PhoneAccountLink } from "@/components/askanus/phone-account-link";\n',''))
if re.search(r"^(<<<<<<<|=======|>>>>>>>)",s,re.M):raise RuntimeError("Unresolved UI conflict")
p.write_text(s)
print("Resolved exact reviewed My Askanus + Gavhah phone conflicts; preserved PR78 paths and PR80 private member menu.")
