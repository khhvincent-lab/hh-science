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


// Screenshot regression: a bare multiline Ti/O array must reach KaTeX as one block.
const table = String.raw`\begin{array}{|c|c|c|}
\hline
\text{化合物} & \mathrm{Ti}\text{ 質量 (g)} & \mathrm{O}\text{ 質量 (g)} \\
\hline
\mathrm{TiO_2} & 1.92 & 1.28 \\
\hline
\text{新氧化物 }\mathrm{Ti}_x\mathrm{O}_y & 1.92 & 0.96 \\
\hline
\end{array}`;
for (const environment of [table, String.raw`\begin{aligned}x&=1\\y&=2\end{aligned}`, String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, String.raw`\begin{array}{c}\begin{matrix}1&2\end{matrix}\end{array}`]) {
  const input = '前文\n' + environment + '\n後文 $n=2$';
  const output = normalize(input);
  assert.equal(output, '前文\n$$' + environment + '$$\n後文 $n=2$');
  assert.equal(normalize(output), output);
  const blocks = output.split(/(\$\$[\s\S]*?\$\$)/);
  assert.equal(blocks.filter(b => b.startsWith('$$')).length, 1);
  assert.doesNotThrow(() => katex.renderToString(blocks[1].slice(2,-2), {displayMode:true,throwOnError:true,strict:false}));
  for (const delimiter of ['$', '$$']) assert.equal(normalize(delimiter + environment + delimiter), delimiter + (delimiter === '$' ? environment.replace(/\n/g,' ') : environment) + delimiter);
}
assert.equal(normalize(table+'\n'+table), '$$'+table+'$$\n$$'+table+'$$');
for (const broken of [String.raw`\begin{array}{c}1`, String.raw`\begin{array}{c}1\end{matrix}`]) assert.equal(normalize(broken), broken);
console.log('Bare math environment regressions passed: Ti/O table, nested arrays, matrices, existing delimiters, idempotence, incomplete input.');
