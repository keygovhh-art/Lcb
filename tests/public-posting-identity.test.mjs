import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRequestedPublicName, publicPostForViewer } from "../artifacts/api-server/src/lib/public-posting-identity.ts";

const user = { name: "Real Member", nickname: "Member Nickname" };

test("only verified full name, nickname, or anonymous may be displayed", () => {
  assert.equal(resolveRequestedPublicName(user, "Member Nickname"), "Member Nickname");
  assert.equal(resolveRequestedPublicName(user, "Real Member"), "Real Member");
  assert.equal(resolveRequestedPublicName(user, "Anonymous"), "Anonymous");
  assert.equal(resolveRequestedPublicName(user, "Someone Else"), "Member Nickname");
  assert.equal(resolveRequestedPublicName(user, "<script>"), "Member Nickname");
  assert.equal(resolveRequestedPublicName(user, undefined), "Member Nickname");
  assert.equal(resolveRequestedPublicName({ name: "Only Full", nickname: null }, "Only Full"), "Only Full");
  assert.equal(resolveRequestedPublicName({ name: "Only Full", nickname: null }, "Fake"), "Only Full");
});

test("public anonymous reads redact author ID, owner and staff retain edit rights", () => {
  const post = { id: 15, authorId: 123, authorName: "Anonymous", content: "Hi" };
  assert.deepEqual(publicPostForViewer(post), { ...post, authorId: null });
  assert.equal(publicPostForViewer(post, 999).authorId, null);
  assert.equal(publicPostForViewer(post, 123).authorId, 123);
  assert.equal(publicPostForViewer(post, 999, "moderator").authorId, 123);
  assert.equal(publicPostForViewer(post, 999, "super_admin").authorId, 123);
  assert.equal(publicPostForViewer({ ...post, authorName: "Member Nickname" }, 999).authorId, 123);
  assert.equal(post.authorId, 123);
});

test("forum, replies, groups, news all use verified public bylines", () => {
  const routes = ["discussions", "groups", "news"].map(
    n => readFileSync(`artifacts/api-server/src/routes/${n}.ts`, "utf8")
  );
  for (const route of routes) {
    assert.match(route, /resolvePublicPostingName/);
    assert.match(route, /publicPostForViewer/);
  }
  assert.equal((routes[0].match(/await resolvePublicPostingName\(userId, authorName\)/g) || []).length, 2);
  assert.match(routes[1], /await resolvePublicPostingName\(userId, authorName\)/);
  assert.match(routes[2], /await resolvePublicPostingName\(userId, authorName\)/);
});
