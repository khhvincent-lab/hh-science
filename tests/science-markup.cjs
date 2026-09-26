const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const katex = require('katex');
const compiled = ts.transpileModule(fs.readFileSync('lib/science-markup.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const api = {};
new Function('exports', compiled)(api);
const {normalizeScienceMarkup: normalize, stripBareAnnotationCommands: bare, stripAnnotationCommands: strip} = api;
for (const token of [String.raw`\nu`,String.raw`\neq`,String.raw`\nabla`,String.raw`\notin`]) assert.equal(normalize(token),token);
assert.equal(normalize(String.raw`第一行\n第二行`), '第一行\n第二行');
assert.equal(normalize(String.raw`\[x=1\]`), '$$x=1$$');
assert.equal(bare(String.raw`向\htmlData{annotation=a1}{左偏}，位於\htmlData{annotation=a2}{南半球}。`), '向左偏，位於南半球。');
assert.equal(strip(String.raw`\htmlData{annotation=a1}{\frac{1}{2}}`), String.raw`\frac{1}{2}`);
assert.equal(strip(String.raw`\htmlData{annotation=a1}{\htmlData{annotation=a2}{2}}`), '2');
const annotated=String.raw`$\htmlData{annotation=a1}{162}\ \mathrm{g/mol}$`;
assert.equal(bare(annotated),annotated);
assert.match(katex.renderToString(annotated.slice(1,-1),{trust:c=>c.command==='\\htmlData'}),/data-annotation="a1"/);
for(const formula of [
 String.raw`{}^{234}_{90}\mathrm{Th}\rightarrow {}^{234}_{91}\mathrm{Pa}+{}^{0}_{-1}\mathrm{e}+{}^{0}_{0}\bar{\nu}`,
 String.raw`{}^{1}_{1}\mathrm{H}+{}^{1}_{1}\mathrm{H}\rightarrow {}^{2}_{1}\mathrm{D}+{}^{0}_{+1}\mathrm{e}+{}^{0}_{0}\nu`
]) {
 const input='$'+formula.replace('\\rightarrow','\n\\rightarrow')+'$';
 const normalized=normalize(input);
 assert.equal(normalized.includes('\n'),false);
 assert.doesNotThrow(()=>katex.renderToString(normalized.slice(1,-1),{throwOnError:true}));
}
console.log('Science markup regressions passed: commands, delimiters, nested annotations, interaction, both nuclear equations.');
