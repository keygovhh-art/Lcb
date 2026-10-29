import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const next = readFileSync("artifacts/api-server/src/lib/signalwire-next-hotline.ts","utf8");
const shared = readFileSync("artifacts/api-server/src/lib/signalwire-shared-ivr.ts","utf8");
const keypad = readFileSync("artifacts/api-server/src/lib/yemot-api-driven-phone.ts","utf8");
const source=next.slice(next.indexOf('const xml='),next.indexOf('// Normalization and protected number list'));
assert.ok(source.includes('export function convertGavhahReplyToCxml'));
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{}};
runInNewContext(js,sandbox);
const reply=(text,mode="iv",n="0",max="1")=>`read=t-${text}=${mode}${n},no,${max},1,8,No,no`;
const convert=(text,root=false)=>sandbox.exports.convertGavhahReplyToCxml(text,"https://gavhah-cloudflare-native.keygovhh.workers.dev/api/signalwire/shared-ivr",root);

test("MAX greeting plays audible English via Say and five-digit 55555 shortcut",()=>{
 const text="Welcome to Olam Hachesed Communications, MAX. Press 1 for MAX. Press 55555 for Emes Newsroom.";
 const c=convert(reply(text,"iv","0","4"),true);
 assert.match(c,/<Response>/);
 assert.match(c,/<Gather input="dtmf"/);
 assert.match(c,/numDigits="5"/);
 assert.match(c,/finishOnKey="#"/);
 assert.match(c,/<Say voice="man" language="en-US">Welcome to Olam Hachesed Communications, MAX/);
 assert.match(c,/method="POST"/);
 assert.match(c,/api\/signalwire\/shared-ivr/);
});

test("single key menu, 8 digit pairing and 16 digit registration have distinct DTMF lengths",()=>{
 assert.match(convert(reply("Press 1", "iv","1","1")),/numDigits="1"/);
 assert.match(convert(reply("Enter website code", "ln","3","8")),/numDigits="8"/);
 assert.match(convert(reply("Enter phone registration code", "rg","4","16")),/numDigits="16"/);
 assert.match(convert(reply("Enter article number", "ar","5","8")),/numDigits="8"/);
});

test("provider XML escapes text and does not leak caller fields",()=>{
 const c=convert(reply('Hello & <item> "quoted"',"iv","8","1"));
 assert.match(c,/Hello &amp; &lt;item&gt;/);
 assert.doesNotMatch(c,/<item>/);
});

test("MAX root does not load unusable old Yemot audio or overwrite live greeting",()=>{
 assert.match(keypad,/if\(!fromShared&&\(mode==="menu"\|\|mode==="root"\)/);
 assert.match(keypad,/sharedSignalwireRoot="Welcome to Olam Hachesed Communications, MAX/);
 assert.match(shared,/reply\.includes\("Welcome to Olam Hachesed Communications, MAX\."/);
});

test("star navigation is safe, 0 resets, 55555 routes to unchanged legacy URL",()=>{
 assert.match(shared,/\(digits!==undefined&&!\/\^\(\?:\[0-9\]\{0,16\}\|\\\*\)\$\/.test\(digits\)\)/);
 assert.match(shared,/digits===LEGACY_EXTENSION/);
 assert.match(keypad,/if\(fromShared && digit==="\*"\)/);
 assert.match(keypad,/path=path.length>2\?path.slice\(0,-1\):""/);
 assert.match(keypad,/if\(digit==="0"\)return ""/);
});
