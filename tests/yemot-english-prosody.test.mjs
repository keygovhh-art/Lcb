import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {yemotEnglishSpeech,yemotEnglishRead} from "../artifacts/api-server/src/lib/yemot-english-prosody.ts";

const src=path=>readFileSync(path,"utf8");
const phone=src("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const root=src("artifacts/api-server/src/lib/yemot-root-voice-repair.ts");
const shared=src("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");

test("One TTS synthesis keeps every spoken menu option, with short natural commas",()=>{
 const x=yemotEnglishSpeech("Good morning, welcome to Gavhah. Press 1 for cases, or 2 for tasks. Thank you.");
 assert.equal(x,"t-Good morning, welcome to Gavhah, Press 1 for cases, or 2 for tasks, Thank you");
 assert.equal(x.split(".t-").length,1);
});
test("More than eight sentences are NEVER cut off after the eighth",()=>{
 const phrase=Array.from({length:11},(_,i)=>"For option, press "+(i+1)+".").join(" ");
 const spoken=yemotEnglishSpeech(phrase,950);
 assert.match(spoken,/For option, press 11/);
 assert.equal(spoken.split(".t-").length,1);
});
test("Long unpunctuated text remains within a single synthesis",()=>{
 const line=new Array(49).fill("task").join(" ");
 assert.equal(yemotEnglishSpeech(line,1000).replace(/^t-/,"").split(" ").length,49);
});
test("No caller text may inject provider script delimiters, remote links, or SSML tags",()=>{
 const s=yemotEnglishSpeech('Hello. f-/123&go_to_folder=/0=bad <break time="900ms"/> https://bad.example/path');
 assert.ok(s.startsWith("t-Hello, "));
 assert.doesNotMatch(s,/go_to_folder|https?:|<|>|&|=|#/);
 assert.doesNotMatch(s,/\.f-|\.s-|\.n-/);
 assert.match(yemotEnglishSpeech("Your amount is 12.50 dollars."),/12 point 50 dollars/);
 assert.match(yemotEnglishSpeech("Hello. שלום"),/^t-Hello/);
});
test("Yemot read command retains original digit prompts intact",()=>{
 const r=yemotEnglishRead("Please enter the code. Press pound to confirm.", "iv12",8);
 assert.equal(r,"read=t-Please enter the code, Press pound to confirm=iv12,no,8,1,12,No,no");
 assert.throws(()=>yemotEnglishRead("Hi","iv12",20));
 assert.throws(()=>yemotEnglishRead("Hi","a=12",2));
});
test("Natural speech is Yemot-only, rate is modest and male voice is retained",()=>{
 assert.match(phone,/yemotEnglishSpeech\(s,430\)/);
 assert.match(phone,/yemotEnglishRead\(spoken,"iv"\+step,reply\.digits\)/);
 assert.match(phone,/return plain\.replace\(\/\[&=#\\-\]\/g/);
 assert.match(root,/voice:"ymMale",tts_voice:"ymMale"/);
 assert.match(root,/rate:"6",tts_rate:"6"/);
 assert.match(root,/r\.line_number!=="6055621286"/);
 assert.doesNotMatch(shared,/yemotEnglishSpeech|yemotEnglishRead|advancedAskanusPhone/);
});
