import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {yemotEnglishSpeech,yemotEnglishRead} from "../artifacts/api-server/src/lib/yemot-english-prosody.ts";

const src=path=>readFileSync(path,"utf8");
const phone=src("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const root=src("artifacts/api-server/src/lib/yemot-root-voice-repair.ts");
const shared=src("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");

test("English caller hears commas within clauses and sentence breaths at .t- boundaries",()=>{
 const x=yemotEnglishSpeech("Good morning, welcome to Gavhah. Press 1 for cases, or 2 for tasks. Thank you.");
 assert.equal(x,"t-Good morning, welcome to Gavhah.t-Press 1 for cases, or 2 for tasks.t-Thank you");
 assert.ok(x.split(".t-").length===3);
});
test("Long unpunctuated hotline lines gain gentle breaths at word boundaries",()=>{
 const line=new Array(49).fill("task").join(" ");
 const parts=yemotEnglishSpeech(line,1000).split(".t-");
 assert.equal(parts.length,3);
 assert.equal(parts.join(" ").replace(/^t-/,"").split(" ").length,49);
});
test("No caller text may inject provider script delimiters, remote links, or SSML tags",()=>{
 const s=yemotEnglishSpeech('Hello. f-/123&go_to_folder=/0=bad <break time="900ms"/> https://bad.example/path');
 assert.ok(s.startsWith("t-Hello.t-"));
 assert.doesNotMatch(s,/go_to_folder|https?:|<|>|&|=|#/);
 assert.doesNotMatch(s,/\.f-|\.s-|\.n-/);
 assert.match(yemotEnglishSpeech("Your amount is 12.50 dollars."),/12 point 50 dollars/);
 assert.match(yemotEnglishSpeech("Hello. שלום"),/^t-Hello/);
});
test("Yemot read command retains original digit prompts intact",()=>{
 const r=yemotEnglishRead("Please enter the code. Press pound to confirm.", "iv12",8);
 assert.equal(r,"read=t-Please enter the code.t-Press pound to confirm=iv12,no,8,1,12,No,no");
 assert.throws(()=>yemotEnglishRead("Hi","iv12",20));
 assert.throws(()=>yemotEnglishRead("Hi","a=12",2));
});
test("Natural speech is Yemot-only, rate is modest and male voice is retained",()=>{
 assert.match(phone,/yemotEnglishSpeech\(s,430\)/);
 assert.match(phone,/yemotEnglishRead\(spoken,"iv"\+step,reply\.digits\)/);
 assert.match(phone,/return plain\.replace\(\/\[&=#\\-\]\/g/);
 assert.match(root,/voice:"ymMale",tts_voice:"ymMale"/);
 assert.match(root,/rate:"2",tts_rate:"2"/);
 assert.match(root,/r\.line_number!=="6055621286"/);
 assert.doesNotMatch(shared,/yemotEnglishSpeech|yemotEnglishRead|advancedAskanusPhone/);
});
