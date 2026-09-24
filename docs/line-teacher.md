# 真人導師 LIFF 交接

- LIFF ID: `2011732473-Xuuu1jD6`
- Endpoint: `https://www.luhauechem.com/line/teacher`
- Size: Full; scopes: openid, profile, chat_message.write.
- LINE Login channel should be linked to 盧澔化學 `@199dbmdh` and published before student rollout.
- Existing official account webhook must remain as configured.

## Student flow

From a saved solution, prepare the package and open the official account chat.
Send the prefilled link, tap it in that chat, review, confirm the chat identity,
and explicitly send. LIFF sends one text and one image message to its originating
chat. It cannot specify the recipient or prove the other party is this OA.
External browsers, groups, and missing message permission are blocked from sending.
Existing native image sharing and photo download remain available.

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

## Verification

- `node scripts/test-line-handoff.cjs` tests capability validation, authorization,
  ownership, package creation/read, account revocation, replacement and cleanup
  using an isolated in-memory storage mock (no student data or LINE sends).
- `npm run build` validates Next.js/TypeScript.
- Browser checks use a mocked LIFF SDK: consent gating, successful text+image,
  external/group denial, uncertain failure handling and mobile overflow.
- Real iOS/Android delivery, original image readability, OA Manager display, and
  compatibility with the existing Apps Script webhook require a real phone test.
  LIFF images create external content-provider webhook events; existing automation
  that assumes LINE-hosted image IDs may need an independent follow-up change.
