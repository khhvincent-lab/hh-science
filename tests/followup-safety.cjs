const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
 const exports = {};
 const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
 new Function('exports', 'require', js)(exports, name => name in mocks ? mocks[name] : require(name));
 return exports;
}
const rules = load('lib/followup-moderation-rules.ts');
for (const text of ['操','幹！','ＦＵＣＫ','f u c k','幹\u200b你娘']) assert.ok(rules.inspectStandaloneProfanity(text), text);
for (const text of ['操作步驟','操場','幹細胞','乾燥','你圖是不是看錯了','這個解答很爛','他說「操」是什麼意思','TMD']) assert.equal(rules.inspectStandaloneProfanity(text), null, text);
assert.equal(rules.parseLanguageVerdict('{"violation":true,"category":"insult","confidence":0.7}'), null);
assert.equal(rules.parseLanguageVerdict('{"violation":false,"category":"insult","confidence":1}'), null);
assert.equal(rules.parseLanguageVerdict('{"violation":true,"category":"insult","confidence":2}'), null);
assert.equal(rules.parseLanguageVerdict('{"violation":true,"category":"threat","confidence":0.99,"reason":"威脅"}').category, 'threat');

async function routeCase({ question = '請重新確認原圖', blocked = false, missing = false, foreign = false, denied = false, imageError = false, classifierError = false } = {}) {
 let solverCalls = 0, imageCalls = 0, inserts = 0, checks = 0, solverRequest;
 const studentId = '11111111-1111-4111-8111-111111111111', historyId = '22222222-2222-4222-8222-222222222222';
 const history = { id: historyId, student_id: studentId, subject: 'earth', answer: '乙丙', explanation: '原解答', options: '', image_paths: [], reference_answer: 'A', question_note: '箭頭方向' };
 const db = { from(table) {
  let inserting = false;
  const chain = { select() { return chain; }, eq() { return chain; }, update() { return chain; },
   insert() { inserts++; inserting = true; return chain; },
   maybeSingle: async () => ({ data: foreign ? null : history }),
   order: async () => ({ data: [] }), single: async () => ({ data: { id: 'saved', question, answer: '已重新看圖', created_at: 'now' } }),
   then(resolve) { resolve({ data: inserting ? [] : null }); },
  }; return chain;
 }};
 const slot = { model: 'test', reasoning: 'low' };
 const mod = load('app/api/followup/route.ts', {
  '@/lib/science/diagram-engine': { normalizeScienceDiagram: () => null, SCIENCE_TEMPLATE_PROMPT: '' },
  '@/lib/teaching-images': { retrieveTeachingImages: async () => ({ images: ['teaching-image'], refs: [], prompt: '' }) },
  '@/lib/supabase-admin': { supabaseAdmin: db },
  '@/lib/session': { verifySessionToken: () => denied ? null : ({ studentId, campus: 'test' }) },
  '@/lib/ai-settings': { getAISolverSettings: async () => ({ followup: { enabled: true, model: slot, maxPerQuestion: 3 }, scienceGate: slot }) },
  '@/lib/ai/solver': { runSolver: async args => { solverCalls++; solverRequest = args; return { text: '{"answer":"已重新看圖"}', provider: 'test', model: 'test', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 } }; } },
  '@/lib/ai/usage-log': { saveSolverUsage: async () => {} },
  '@/lib/ai/json': { parseFollowupResponse: JSON.parse, unwrapStoredScienceAnswer: x => x },
  '@/lib/teaching-engine': { buildTeachingContext: async () => '' },
  '@/lib/followup-moderation-rules': rules,
  '@/lib/followup-moderation': {
   checkLanguageState: async (_s, _h, _r, _q, verdict) => { checks++; return { count: blocked ? 3 : verdict ? 1 : 0, blockedUntil: blocked ? '2099-01-01' : null }; },
   classifyFollowup: async q => { if (classifierError) throw Error('test moderation outage'); return { verdict: rules.inspectStandaloneProfanity(q) }; },
  },
  '@/lib/followup-images': { loadFollowupImages: async () => { imageCalls++; if (imageError) throw Error('test storage outage'); return missing ? [] : ['original-image-1', 'original-image-2']; } },
 });
 const response = await mod.POST({ cookies: { get: () => ({ value: 'test' }) }, json: async () => ({ historyId, question, recheckImage: true }) });
 return { status: response.status, data: await response.json(), solverCalls, imageCalls, inserts, checks, solverRequest };
}
(async () => {
 let r = await routeCase({ question: '操' }); assert.equal(r.status, 422); assert.equal(r.solverCalls, 0); assert.equal(r.inserts, 0); assert.equal(r.imageCalls, 0);
 r = await routeCase({ blocked: true }); assert.equal(r.status, 429); assert.equal(r.solverCalls, 0); assert.equal(r.checks, 1);
 r = await routeCase({ foreign: true }); assert.equal(r.status, 404); assert.equal(r.checks, 0); assert.equal(r.imageCalls, 0);
 r = await routeCase({ denied: true }); assert.equal(r.status, 401); assert.equal(r.checks, 0);
 r = await routeCase({ missing: true }); assert.equal(r.status, 422); assert.equal(r.inserts, 0); assert.equal(r.solverCalls, 0);
 r = await routeCase({ imageError: true }); assert.equal(r.status, 503); assert.equal(r.inserts, 0);
 const originalError = console.error; console.error = () => {};
 r = await routeCase({ classifierError: true }); console.error = originalError; assert.equal(r.status, 503); assert.equal(r.inserts, 0); assert.equal(r.solverCalls, 0);
 r = await routeCase(); assert.equal(r.status, 200); assert.equal(r.inserts, 1); assert.deepEqual(r.solverRequest.images, ['original-image-1', 'original-image-2', 'teaching-image']); assert.match(r.solverRequest.prompt, /附圖前 2 張/); assert.match(r.solverRequest.prompt, /箭頭方向/);
 // Actual storage loader preserves order and rejects foreign paths before downloading.
 let paths = [];
 const { loadFollowupImages } = load('lib/followup-images.ts', {
  '@/lib/supabase-admin': { supabaseAdmin: { storage: { from: () => ({ download: async path => { paths.push(path); return { data: new Blob(['png']) }; } }) } } },
  '@/lib/teaching-images': { imageMime: () => 'image/png' },
 });
 await loadFollowupImages([{ path: 'student/b.png', order: 1 }, { path: 'student/a.png', order: 0 }], 'student'); assert.deepEqual(paths, ['student/a.png', 'student/b.png']);
 paths = []; await assert.rejects(() => loadFollowupImages([{ path: 'other/a.png' }], 'student')); assert.equal(paths.length, 0);
 console.log('PASS: language rules, uncertain verdicts, blocked quota preservation, ownership, cooldown, outage handling, original images and ordering');
})().catch(e => { console.error(e); process.exitCode = 1; });

(async () => {
 let allowed = ['student-a'], authorized = true, reviewed = 0;
 const chain = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { student_id: 'student-b' } }) };
 const access = { requireAdminSession: async () => authorized ? { userId: 'teacher', role: 'teacher' } : null, getAccessibleStudentIds: async () => allowed };
 const adminRoute = load('app/api/admin/language-events/route.ts', {
  '@/lib/admin-access': access,
  '@/lib/supabase-admin': { supabaseAdmin: { from: () => chain, rpc: async () => { reviewed++; return { error: null }; } } },
 });
 const request = { json: async () => ({ id: '33333333-3333-4333-8333-333333333333', action: 'dismiss' }) };
 assert.equal((await adminRoute.PATCH(request)).status, 403); assert.equal(reviewed, 0);
 allowed = ['student-b']; assert.equal((await adminRoute.PATCH(request)).status, 200); assert.equal(reviewed, 1);
 authorized = false; assert.equal((await adminRoute.PATCH(request)).status, 401);
 const middleware = load('proxy.ts', { '@/lib/admin-access': { requireAdminSession: async () => ({ role: 'teacher' }) } });
 assert.equal((await middleware.proxy({ nextUrl: { pathname: '/api/admin/language-events' }, method: 'PATCH' })).status, 200);
 console.log('PASS teacher review authorization, cross-student denial and middleware access');
})().catch(e => { console.error(e); process.exitCode = 1; });
