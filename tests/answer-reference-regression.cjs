const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function compile(path, requireModule) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: requireModule });
  return exports;
}
const normalization = compile('lib/ai/answer-normalization.ts', require);
const match = normalization.referenceAnswersMatch;
const options = String.raw`(A) 錯：若波速為 $10\\text{ m/s}$。
(B) 錯：計算出的可能波速序列為 $6, 14, 22$。
(C) 對：當 $n=1$ 時，波速為 $14\\text{ m/s}$，週期約為 $0.57\\text{ s}$，落在範圍內。
(D) 錯：波速唯一確定為 $14\\text{ m/s}$。`;
const cases = [
  ['(1) B、(2) C', 'B和C', true],
  ['例題五：(B)；例題六：(A)', '第一題是B，第二題是A', true],
  ['1. (D)  2. (B)  3. (C)', 'D,B,C', true],
  ['(1) B、(2) C', 'C和B', false],
  ['1. (D) 2. (B) 3. (C)', 'D,C,B', false],
  ['(1) B、(2) C', 'B', false],
  ['(1) B、(2) C', '(2) B、(3) C', false],
  ['(1) B、(2) C', 'B或C', false],
  ['ACD', 'DCA', true],
  ['(C)', '14', true, options],
  ['(C)', '10', false, options],
  ['(C)', '14', false, '(A) 14 m/s\n(C) 12 m/s'],
  ['(C)', '14', true, '(A) 10 m/s\n(C) 14 m/s'],
  ['(C)', '14', false, '(C) 14 m/s\n(C) 12 m/s'],
  ['(C)', '14', false, '(C) 對：波速為 14 m/s，速度為 12 m/s。'],
  ['(C)', '14', false, '(C) 對：波速不是 14 m/s。'],
  ['8 g', '8', true],
  [String.raw`8\\ \\mathrm{g}`, '8', true],
  ['(1) 0.025 mol；(2) 190 mmHg；(3) 760 mmHg', '0.025,190,760', true],
  ['8 kg', '8 g', false],
  ['8 m', '8 M', false],
  ['DE', '第21題：DE', true],
  [String.raw`$\\mathrm{C_3H_8}$`, 'C3H8', true],
  ['C3H6', 'C3H8', false],
];
for (const [answer, reference, expected, context] of cases) assert.equal(match(answer, reference, context), expected, `${answer} vs ${reference}`);
const { answerReviewState: state } = compile('lib/accuracy-review.ts', id => id.includes('answer-normalization') ? normalization : { supabaseAdmin: {} });
assert.equal(state('(C)', '14', undefined, options).countsCorrect, true);
assert.equal(state('(C)', '14', { verdict: 'ai_incorrect' }, options).countsCorrect, false);
assert.equal(state('(C)', '14', { verdict: 'invalid_question' }, options).excluded, true);
assert.equal(state('(C)', '14', { verdict: 'invalid_question' }, options).countsCorrect, false);
assert.equal(state('(C)', '14', { verdict: 'unreviewed' }, options).needsReview, false);
assert.equal(state('(1) 1384.4 kJ/mol（或 -1384.4）\n(2) 反應式', '1384.4kJ/mol').excluded, true);
assert.equal(state('8 g', '').countsCorrect, false);
console.log(`${cases.length + 7} reference and review regression checks passed`);
