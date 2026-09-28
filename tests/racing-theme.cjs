const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const css = fs.readFileSync('app/racing-theme.css', 'utf8');
const picker = fs.readFileSync('components/theme-toggle.tsx', 'utf8');
const script = layout.match(/const themeScript = `([\s\S]*?)`;/)[1];
for (const [saved, expected] of [['racing','racing'], ['midnight','midnight'], ['nordic','nordic'], ['aurora','aurora'], ['gold','gold'], ['obsidian','obsidian'], ['burgundy','gold'], ['unknown','midnight']]) {
  const root = { dataset:{}, style:{} }; let color;
  vm.runInNewContext(script, {
    localStorage:{getItem:()=>saved,setItem:()=>{}},
    document:{documentElement:root,querySelector:()=>({setAttribute:(_,value)=>{color=value;}})},
  });
  assert.equal(root.dataset.theme, expected);
  assert.equal(root.style.colorScheme, ['nordic','aurora'].includes(expected)?'light':'dark');
  if (expected==='racing') assert.equal(color,'#101114');
}
assert.match(picker, /id: "racing", label: "曜黑競速"/);
assert.match(css,/v206-quota-warning/); assert.match(css,/v206-quota-danger/);
function luminance(hex) {
  const rgb=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
for (const [text,bg] of [['fff7f8','a91529'],['f4f4f5','35151e'],['d6bec6','35151e'],['bfa3ad','421d29'],['ffe34d','35151e']]) {
  const ratio=(luminance(text)+.05)/(luminance(bg)+.05);
  assert.ok(ratio>=4.5, `${text}/${bg}: ${ratio}`);
}
console.log('PASS: six themes, reload bootstrap, legacy migration, quota states and text contrast');
