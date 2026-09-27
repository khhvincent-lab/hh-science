# Student teaching depth

## Behavior

- Three compact options above Start Solve: 精簡解答 / 標準詳解 / 深度解析.
- First use loads the teacher default from authenticated GET /api/teaching-mode. Teacher-only correction defaults to standard for students.
- Explicit choices are stored per student ID on the current device. They do not change global settings. Failed storage does not prevent use; failed defaults allow manual selection.
- Validated teachingMode travels with stored job input (including retry), enters every primary/verifier/arbiter prompt, and is recorded in API usage metadata and the job result's ai.teachingMode.
- The completed result shows the actual returned mode, not the current selector. Existing historical explanations are not regenerated.
- All modes retain key review, accurate reasoning and teacher guardrails; only instructional depth changes. Removed the conflicting global brevity limits.
- Admin settings distinguish saved default from unsaved selection, with an additional save button beside the modes.
- No schema migration, production data changes or new paid API calls required to install.

## Verification

Passed with the existing lockfile and Next.js 16.3.4:

- npm run build (local placeholder environment; no production credentials)
- npx tsc --noEmit
- node tests/teaching-mode.cjs: whitelist, defaults/auth, distinct contracts, five routing paths, arbiters and trace metadata
- node tests/workflow-e2e.cjs: compiled local Workflow + mock provider/storage, deep mode preserved through submission and completion
- node tests/upgrade-v240.cjs
- node tests/answer-reference-regression.cjs
- node tests/science-markup.cjs
- node tests/science-library.cjs

Browser tests are included in tests/teaching-mode.spec.mjs but have NOT passed in this environment: Chromium cannot start because socket() returns Operation not permitted. Run them together with student-home-reset.spec.mjs in an environment that permits Chromium before production release. No real-model comparison or production-site verification has been performed.

Browser test scenarios: mobile/desktop row layout, teacher default, per-account preference, reload, submission/result mode, return home, late defaults, failed defaults and blocked local storage.
