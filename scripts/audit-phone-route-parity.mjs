// Baseline route coverage check. This checks *names*, never live functionality.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const web=readFileSync(resolve(root,'artifacts/gavhah/src/App.tsx'),'utf8');
const ivr=readFileSync(resolve(root,'artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts'),'utf8');
const actual=[...new Set([...web.matchAll(/<Route\s+path="([^"]+)"/g)].map(m=>m[1]))].sort();
const phone=[...new Set([...ivr.matchAll(/leaf\("[^"]+","([^"]+)"/g)].map(m=>m[1]))].sort();
const missing=actual.filter(r=>!phone.includes(r));
assert.equal(missing.length,0,
 'Web routes missing from phone roadmap (NOT WORKING IVR): '+missing.join(', '));
assert.ok(actual.length>20,'Route parser appears incomplete; review parser before passing');
assert.ok(ivr.includes('Caller phone numbers are NOT identity.'),
 'Do not remove caller identity safety rule');
console.log('PASS: '+actual.length+' published Gavhah web route paths have a matching IVR roadmap leaf.');
console.log('WARNING: route inventory does NOT prove a single phone action works.');
