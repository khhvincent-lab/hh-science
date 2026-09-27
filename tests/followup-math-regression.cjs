const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, esModuleInterop:true}}).outputText;
  new Function('exports','require',js)(exports,id => id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id));
  return exports;
}
const {parseAIJson,parseFollowupResponse,unwrapStoredScienceAnswer} = load('lib/ai/json.ts');
const markup = load('lib/science-markup.ts');
const {normalizeScienceMarkup} = markup;
const {renderScienceFormula: render} = load('lib/science-render.ts');
const validArray = String.raw`\begin{array}{c|ccc}&\mathrm{Pb^{2+}}&\mathrm{Sr^{2+}}&\mathrm{SO_4^{2-}}\\ \text{由溶解產生}&x&y&x+y\end{array}`;
const validApprox = String.raw`x\approx0.020\ \mathrm{M}`;
for (const answer of [validArray, validApprox, String.raw`\frac{1}{2}+\theta+\nu+\beta`, '第一行\nnext line\t最後一行', '引號 "文字" 與 \\ 路徑']) {
  const raw = JSON.stringify({answer,diagram:null});
  assert.equal(parseAIJson(raw).answer, answer, 'valid JSON must round-trip');
  assert.equal(unwrapStoredScienceAnswer(raw),answer.trim());
}
// Real newlines in strings plus a mixture of correct and single-slash commands.
const legacy = '{"answer":"設 $x$、$y$。\n$$' + validArray.replace(/\\/g,'\\\\') + '$$\n所以 $' + validApprox + '$。","diagram":null}';
const recovered = parseFollowupResponse(legacy).answer;
assert.equal(recovered, '設 $x$、$y$。\n$$'+validArray+'$$\n所以 $'+validApprox+'$。');
assert.equal(normalizeScienceMarkup(legacy),recovered);
assert.equal(parseAIJson(String.raw`{"answer":"$\frac{1}{2}+\theta+\nu+\beta$"}`).answer,String.raw`$\frac{1}{2}+\theta+\nu+\beta$`);
assert.equal(parseAIJson(String.raw`{"answer":"first\nnext\tword"}`).answer,'first\nnext\tword');
assert.equal(parseAIJson('```json\n'+JSON.stringify({answer:validApprox})+'\n```').answer, validApprox);
assert.equal(parseFollowupResponse('這是純文字回答。').answer,'這是純文字回答。');
for (const broken of ['{"answer":"未完成', '{"answer":42}', '{"diagram":null}', '{"answer":"", "diagram":null}']) {
  assert.throws(()=>parseFollowupResponse(broken));
  assert.doesNotMatch(unwrapStoredScienceAnswer(broken),/"answer"|"diagram"/);
}
// IMG_0399: surplus closing group, without changing charges or coefficients.
const badIon = String.raw`[\mathrm{SO_4^{2-}}] = [\mathrm{Pb^{2+}}] + [\mathrm{Sr^{2+}}}]`;
const goodIon = String.raw`[\mathrm{SO_4^{2-}}] = [\mathrm{Pb^{2+}}] + [\mathrm{Sr^{2+}}]`;
assert.equal(render(badIon,true),render(goodIon,true));
// IMG_0401: incomplete annotation wrapper around a valid inequality.
const inequality = String.raw`3.2\times10^{-5}\ \mathrm{M}>2.4\times10^{-6}\ \mathrm{M}`;
assert.equal(render(String.raw`\htmlData{annotation=a10}{`+inequality,false),render(inequality,false));
for (const formula of [validArray,validApprox,goodIon,inequality]) {
  const html = render(formula,true);
  assert.match(html,/class="katex/);
  assert.doesNotMatch(html,/katex-error|science-formula-fallback/);
}
assert.equal(render(validArray.replace(/\\/g,'\\\\'),true),render(validArray,true));
assert.match(render(String.raw`\htmlData{annotation=a1}{162}`,false),/data-annotation="a1"/);
const fallback = render(String.raw`\notARealCommand{<img src=x onerror=alert(1)>}`,false);
assert.match(fallback,/公式格式待確認/);
assert.doesNotMatch(fallback,/<img|katex-error/);
assert.match(fallback,/&lt;img/);
assert.equal(markup.stripBareAnnotationCommands(String.raw`濃度\htmlData{annotation=a10}{$x$仍下降`),'濃度$x$仍下降');
// Exercise the actual admin React component, not only the helper functions.
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const source = fs.readFileSync('app/admin/page.tsx','utf8');
const ast = ts.createSourceFile('admin.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names = new Set(['AdminScienceText','looksLikeAdminMathExpression','adminRenderKatex']);
const selected = ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const code = ts.transpileModule(selected+'\nexports.Component = AdminScienceText;', {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const componentApi = {};
new Function('exports','React','normalizeAdminScienceMarkup','stripBareAnnotationCommands','stripAdminAnnotationCommands','renderScienceFormula',code)(componentApi,React,normalizeScienceMarkup,markup.stripBareAnnotationCommands,markup.stripAnnotationCommands,render);
for (const text of [legacy,'$$'+badIon+'$$',String.raw`濃度 $\htmlData{annotation=a10}{`+inequality+'$，所以不符合標準。',JSON.stringify({answer:'這裡 $'+validApprox+'$。',diagram:null})]) {
  const html = renderToStaticMarkup(React.createElement(componentApi.Component,{text}));
  assert.doesNotMatch(html,/katex-error|science-formula-fallback|&quot;answer&quot;|&quot;diagram&quot;/);
  assert.match(html,/class="katex/);
}
console.log('Follow-up JSON and four screenshot-format regressions passed.');
const studentSource = fs.readFileSync('app/page.tsx','utf8');
const studentAst = ts.createSourceFile('student.tsx',studentSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const studentNames = new Set(['ScienceText','looksLikeMathExpression','renderKatex']);
const studentSelected = studentAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&studentNames.has(n.name?.text)).map(n=>n.getText(studentAst)).join('\n');
const studentCode = ts.transpileModule(studentSelected+'\nexports.Component = ScienceText;', {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const studentApi = {};
new Function('exports','React','normalizeScienceMarkup','stripBareAnnotationCommands','stripExportAnnotationCommands','renderScienceFormula',studentCode)(studentApi,React,normalizeScienceMarkup,markup.stripBareAnnotationCommands,markup.stripAnnotationCommands,render);
for (const text of [legacy,'$$'+badIon+'$$',String.raw`濃度 $\htmlData{annotation=a10}{`+inequality+'$，所以不符合標準。']) {
  for (const stripAnnotations of [false,true]) {
    const html = renderToStaticMarkup(React.createElement(studentApi.Component,{text,stripAnnotations}));
    assert.doesNotMatch(html,/katex-error|science-formula-fallback|&quot;answer&quot;|&quot;diagram&quot;/);
    assert.match(html,/class="katex/);
  }
}
console.log('Actual student, export and admin component rendering passed.');
