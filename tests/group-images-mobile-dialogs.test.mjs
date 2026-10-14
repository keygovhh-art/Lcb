import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const list=read("artifacts/gavhah/src/pages/groups/index.tsx");
const detail=read("artifacts/gavhah/src/pages/groups/detail.tsx");
const preview=read("artifacts/gavhah/src/components/shared/image-upload-field.tsx");

test("group cards and group details never cut off source image edges",()=>{
  assert.match(list,/<img src=\{group\.imageUrl\}[^>]*object-contain/s);
  assert.match(detail,/<img src=\{group\.imageUrl\}[^>]*object-contain/s);
  assert.doesNotMatch(list,/aspect-\[3\/1\]/);
  assert.doesNotMatch(detail,/aspect-\[4\/1\]/);
  assert.doesNotMatch(list,/<img src=\{group\.imageUrl\}[^>]*object-cover/s);
  assert.doesNotMatch(detail,/<img src=\{group\.imageUrl\}[^>]*object-cover/s);
  assert.match(list,/max-h-\[75dvh\]/);
  assert.match(detail,/max-h-\[85dvh\]/);
});
test("privacy label is not layered over the group cover art",()=>{
  assert.doesNotMatch(list,/absolute top-2 right-2/);
  assert.match(list,/self-start rounded-full/);
});
test("mobile Edit Group modal scrolls the entire editable form without trapping save control",()=>{
  assert.match(detail,/<Dialog open=\{editGroupOpen\}/);
  assert.match(detail,/max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(detail,/min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y/);
  assert.match(detail,/shrink-0 border-t bg-background/);
  assert.match(detail,/היט אפ ענדערונגען/);
});
test("Create Group form also supports keyboard-sized viewport and full-page scrolling",()=>{
  assert.match(list,/max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(list,/min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y/);
  assert.match(list,/form onSubmit=\{submitGroup\} className="flex min-h-0 flex-1 flex-col"/);
  assert.match(list,/type="submit" className="w-full min-h-11/);
});
test("uploaded image preview is not cropped either",()=>{
  assert.match(preview,/object-contain/);
  assert.doesNotMatch(preview,/<img src=\{value\}[^>]*object-cover/s);
});
