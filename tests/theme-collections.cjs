const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const css=fs.readFileSync('app/collections-theme.css','utf8');
const script=fs.readFileSync('app/layout.tsx','utf8').match(/const themeScript = `([\s\S]*?)`;/)[1];
function lum(hex){return hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
for(const m of css.matchAll(/html\[data-theme="((?:iphone|f1)-[^"]+)"\] \{([\s\S]*?)\n\}/g)){
 const [,id,body]=m;const tokens=Object.fromEntries([...body.matchAll(/--([\w-]+):([^;]+);/g)].map(m=>[m[1],m[2]]));
 const root={dataset:{},style:{}};let meta;
 vm.runInNewContext(script,{localStorage:{getItem:()=>id,setItem(){}},document:{documentElement:root,querySelector:()=>({setAttribute:(n,v)=>meta=v})}});
 assert.equal(root.dataset.theme,id);assert.equal(meta,tokens.bg);
 assert.equal(root.style.colorScheme,/color-scheme:light/.test(body)?'light':'dark');
 for(const [fg,bg] of [['text','surface'],['text-secondary','surface'],['primary','surface'],['action-text','action']]){
 const a=lum(tokens[fg]),b=lum(tokens[bg]),r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(r>=4.5,`${id} ${fg}: ${r}`);
 }
 console.log('PASS',id,'reload, color-scheme and 4 text contrast pairs');
}
