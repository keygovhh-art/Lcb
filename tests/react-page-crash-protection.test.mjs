import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isExpectedAbort } from '../artifacts/gavhah/src/lib/system-error-reporter.ts';

test('cancelled navigation and aborted API queries are not system incidents', () => {
  const signalError = new Error('signal is aborted without reason');
  const browserAbort = new Error('This operation was aborted');
  browserAbort.name = 'AbortError';
  assert.equal(isExpectedAbort(signalError), true);
  assert.equal(isExpectedAbort(browserAbort), true);
  assert.equal(isExpectedAbort(new DOMException('The operation was aborted.', 'AbortError')), true);
  assert.equal(isExpectedAbort('signal is aborted'), true);
});

test('actual failures and timeouts remain reportable', () => {
  assert.equal(isExpectedAbort(new Error('Failed to fetch')), false);
  assert.equal(isExpectedAbort(new Error('NetworkError when attempting to fetch resource')), false);
  assert.equal(isExpectedAbort(new Error('Request timed out')), false);
  assert.equal(isExpectedAbort(new Error('500 Internal Server Error')), false);
  assert.equal(isExpectedAbort(new Error('insertBefore: The node before which the new node is to be inserted is not a child of this node.')), false);
  assert.equal(isExpectedAbort(undefined), false);
});

test('app DOM is excluded from automatic browser translation', () => {
  const html = readFileSync('artifacts/gavhah/index.html', 'utf8');
  assert.match(html, /<div id="root" translate="no"><\/div>/);
  assert.match(html, /<meta name="google" content="notranslate"/);
});

test('global app does not falsely log expected fetch aborts', () => {
  const app = readFileSync('artifacts/gavhah/src/App.tsx', 'utf8');
  assert.match(app, /!isExpectedAbort\(error\)/);
  const reporter=readFileSync('artifacts/gavhah/src/lib/system-error-reporter.ts','utf8');
  assert.match(reporter, /if \(isExpectedAbort\(reason\)\) return;/);
  assert.doesNotMatch(reporter, /event\.preventDefault\(\)/);
  assert.doesNotMatch(reporter, /addEventListener\("submit", onSubmit/);
});

test('site copy only watches React subtree if published replacements are present',()=>{
  const siteCopy=readFileSync('artifacts/gavhah/src/components/shared/site-copy-layer.tsx','utf8');
  assert.match(siteCopy, /if \(replacementMap\.size === 0\) return;/);
  assert.match(siteCopy, /observer\.observe\(document\.getElementById\("root"\)/);
});

test('per-route error boundary isolates page crashes and cached clients cannot create fake abort incidents', () => {
  const app = readFileSync('artifacts/gavhah/src/App.tsx', 'utf8');
  const server = readFileSync('artifacts/api-server/src/routes/system-errors.ts', 'utf8');
  assert.match(app, /<AppErrorBoundary key={route}>/);
  assert.match(server, /expected_request_cancellation/);
  assert.match(server, /\["fetch_failure", "unhandled_promise"\]/);
});
