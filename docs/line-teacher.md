# 真人導師 LIFF 交接

- LIFF ID: `2011732473-Xuuu1jD6`
- Endpoint: `https://www.luhauechem.com/line/teacher`
- Size: Full; scopes: openid, profile, chat_message.write.
- LINE Login channel should be linked to 盧澔化學 `@199dbmdh` and published before student rollout.
- Existing official account webhook must remain as configured.

## Student flow

From a saved solution, optionally enter a question and click 詢問真人老師.
The button prepares images, saves the student's pending package, and navigates
to the official chat (with a fallback tap link if the OS blocks navigation).
Tap the rich menu 傳送剛才的題目, which must use the fixed URL
`https://liff.line.me/2011732473-Xuuu1jD6` (not the raw endpoint).
On first use, log in with the existing student class/name/personal PIN and
explicitly bind LINE. Later visits retrieve only this LINE identity's pending
package without another student login. Confirm once to send and close the page.
LIFF sends one text and one image message to its originating
chat. It cannot specify the recipient or prove the other party is this OA.
External browsers, groups, and missing message permission are blocked from sending.
Existing native image sharing and photo download remain available.

The fixed rich-menu button must still be configured/published by the OA manager.
Without it, a manually posted fixed LIFF link in that same chat can test the entry.
Legacy signed links remain readable for their original 24-hour lifetime.

## Storage and authorization

Apply the line_handoff_storage migration before rollout. The new bucket is private
with no public-client policies. Creation requires the student's session, active
account, same-origin request, and history ownership. A separately signed capability
expires after 24 hours and is rechecked against the active account and history.
Replacing a package invalidates its old link. Images have immutable nonce paths;
previous package images are removed after successful replacement. In-flight failed
or concurrent uploads can leave orphaned files; periodic storage maintenance may
be needed. Expiry limits access, not physical retention. Signed image URLs last up
to one hour; LINE may cache delivered media independently.

The link grants access to the student's name and this question's image. Treat it
as private. No LINE channel secret/access token is used or included in frontend code.
Image compression retains the full canvas and refuses oversized images rather than
cropping. Very large solutions can use the native sharing fallback.

Also apply `line_student_pending`. Both new tables enable RLS and revoke access
from anon/authenticated; only server-side service_role may access them. The server
verifies the LIFF ID token with LINE's verify endpoint and checks audience, issuer,
expiry, and subject. Never accept a browser-supplied LINE user ID. Unique keys
prevent silently replacing another student's binding. PIN changes invalidate the
binding until the student reauthenticates. Disabled accounts cannot read packages.
LINE users can explicitly unlink themselves in 帳號綁定設定. Lost LINE accounts
require administrator-assisted unlinking; no public account takeover endpoint.
The request nonce is rechecked before sending, and compare-and-delete removes only
the sent pending record. Uncertain sends preserve the record and warn the student
to check the chat before retrying. LINE delivery cannot be transactionally committed
with our database; a lost acknowledgment can still require manual duplicate checks.

## Verification

- `node scripts/test-line-handoff.cjs` tests capability validation, authorization,
  ownership, package creation/read, account revocation, replacement and cleanup
  using an isolated in-memory storage mock (no student data or LINE sends).
- `npm run build` validates Next.js/TypeScript.
- `node scripts/test-line-pending.cjs` covers binding, verified LINE identity,
  revocation, expiry, stale previews, compare-delete and rate limiting with mocks.
- `node scripts/test-line-browser.cjs` uses Playwright and a production build;
  requires CODEX_PRIMARY_RUNTIME_NODE_MODULES and TEST_CHROMIUM (default /tmp/hh-chromium).
- Browser checks use a mocked LIFF SDK: first-time binding, returning identity,
  explicit send, automatic close, external/group denial, changed-package blocking,
  uncertain failure handling and mobile overflow. No real messages are sent.
- Real iOS/Android delivery, original image readability, OA Manager display, and
  compatibility with the existing Apps Script webhook require a real phone test.
  LIFF images create external content-provider webhook events; existing automation
  that assumes LINE-hosted image IDs may need an independent follow-up change.
