import type { ScienceDiagram, ScienceDiagramPrimitive as P } from '@/lib/ai/types';
export type LibraryImageRef = { id:string; title:string; description:string };
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const text=(x:unknown,n=80)=>typeof x==='string'?x.slice(0,n):'';
const bound=(x:number)=>Math.max(0,Math.min(100,x));
const line=(x1:number,y1:number,x2:number,y2:number,extra:Partial<P>={}):P=>({kind:'line',x1,y1,x2,y2,...extra});
const label=(x:number,y:number,t:string):P=>({kind:'label',x,y,text:t});
const poly=(points:number[][]):P=>({kind:'polyline',points:points.map(([x,y])=>({x,y}))});
const rect=(x:number,y:number,width:number,height:number):P=>({kind:'rect',x,y,width,height});
const circle=(cx:number,cy:number,r:number):P=>({kind:'circle',cx,cy,r});

// Equipment geometry is authored once; the model only chooses the scientific scene.
function flask(x:number,y:number,w=20,h=25):P[]{return [poly([[x+w*.36,y],[x+w*.36,y+h*.3],[x,y+h],[x+w,y+h],[x+w*.64,y+h*.3],[x+w*.64,y]])];}
function beaker(x:number,y:number,w=22,h=22):P[]{return [poly([[x,y],[x,y+h],[x+w,y+h],[x+w,y],[x+w-3,y+2]]),line(x+2,y+h*.62,x+w-2,y+h*.62,{role:'accent'})];}
function apparatus(kind:string):P[]|null{
 if(kind==='filtration')return [label(12,9,'重力過濾'),poly([[34,20],[62,20],[50,38],[50,50],[46,50],[46,38],[34,20]]),poly([[38,23],[48,34],[58,23]]),...flask(36,48,25,30),label(66,27,'濾紙'),label(65,74,'濾液'),line(20,84,75,84),line(25,16,25,84),line(25,36,43,36)];
 if(kind==='titration')return [label(12,9,'滴定'),rect(43,16,7,39),line(43,24,50,24,{role:'accent'}),line(39,55,55,55),poly([[46,55],[46,61],[48,61],[48,55]]),line(47,64,47,68,{dashed:true,role:'accent'}),...flask(35,70,24,20),label(57,22,'滴定管'),label(58,55,'活栓'),label(63,84,'待測液'),line(22,18,22,94),line(14,94,70,94),line(22,35,43,35)];
 if(kind==='distillation')return [label(9,7,'簡易蒸餾示意'),circle(23,61,10),poly([[19,52],[19,29],[27,29],[27,52]]),line(23,17,23,38),circle(23,38,1),label(5,14,'溫度計'),poly([[27,38],[39,38],[79,61],[82,66]]),poly([[40,34],[77,55],[73,63],[36,42],[40,34]]),line(45,37,48,29,{role:'accent'}),line(66,59,64,68,{role:'accent'}),label(33,25,'出水'),label(53,73,'進水'),...flask(73,68,18,20),line(14,73,33,73),line(17,73,14,87),line(30,73,33,87),poly([[22,86],[20,81],[24,75],[26,81],[22,86]]),label(8,95,'熱源'),label(76,96,'餾出液')];
 return null;
}
function compileTemplate(t:any):{primitives:P[];table?:ScienceDiagram['table']}|null{
 if(!t||typeof t!=='object')return null;
 if(t.kind==='force'){
  if(!Array.isArray(t.forces)||!t.forces.length||t.forces.length>8)return null;
  if(t.forces.some((f:any)=>!finite(f.angle)||!finite(f.magnitude)||f.magnitude<=0||!text(f.label)))return null;
  const max=Math.max(...t.forces.map((f:any)=>f.magnitude));const p:P[]=[rect(44,44,12,12),label(41,65,text(t.object||'物體',12))];
  for(const f of t.forces){const a=f.angle*Math.PI/180,len=30*f.magnitude/max,x=50+Math.cos(a)*len,y=50-Math.sin(a)*len;p.push(line(50,50,x,y,{kind:'arrow',role:'accent'}));p.push(label(bound(x+Math.cos(a)*6-3),bound(y-Math.sin(a)*6),text(f.label,20)));}return {primitives:p};
 }
 if(t.kind==='grid'||t.kind==='table'){
  const rows=t.kind==='table'?t.rows:null;
  if(t.kind==='table'){
   if(!Array.isArray(t.headers)||!t.headers.length||t.headers.length>8||!Array.isArray(rows)||rows.length>20||!rows.length||rows.some((r:any)=>!Array.isArray(r)||r.length!==t.headers.length))return null;
   return {primitives:[],table:{headers:t.headers.map((v:unknown)=>text(String(v),60)),rows:rows.map((r:unknown[])=>r.map(v=>text(String(v),100)))}};
  }
  if(!Number.isInteger(t.rows)||!Number.isInteger(t.columns)||t.rows<1||t.rows>8||t.columns<1||t.columns>8)return null;
  const p:P[]=[];for(let r=0;r<=t.rows;r++)p.push(line(12,14+r*70/t.rows,88,14+r*70/t.rows));for(let c=0;c<=t.columns;c++)p.push(line(12+c*76/t.columns,14,12+c*76/t.columns,84));
  if(Array.isArray(t.cells))for(const cell of t.cells.slice(0,64)){if(Number.isInteger(cell.row)&&Number.isInteger(cell.column)&&cell.row>=0&&cell.row<t.rows&&cell.column>=0&&cell.column<t.columns)p.push(label(14+(cell.column+.12)*76/t.columns,14+(cell.row+.5)*70/t.rows,text(cell.text,8)));}return {primitives:p};
 }
 if(t.kind==='plot'){
  if(!Array.isArray(t.xRange)||!Array.isArray(t.yRange)||![...t.xRange,...t.yRange].every(finite)||t.xRange.length!==2||t.yRange.length!==2)return null;
  const [xmin,xmax]=t.xRange,[ymin,ymax]=t.yRange;if(xmin>=xmax||ymin>=ymax||!Array.isArray(t.points)||t.points.length<2||t.points.length>100)return null;
  if(t.points.some((p:any)=>!finite(p.x)||!finite(p.y)||p.x<xmin||p.x>xmax||p.y<ymin||p.y>ymax))return null;
  const x=(v:number)=>16+(v-xmin)/(xmax-xmin)*68,y=(v:number)=>80-(v-ymin)/(ymax-ymin)*60;
  const p:P[]=[line(16,80,90,80,{kind:'arrow'}),line(16,80,16,13,{kind:'arrow'}),label(55,96,text(t.xLabel,18)),label(5,8,text(t.yLabel,18))];
  for(let i=0;i<=4;i++){const vx=xmin+(xmax-xmin)*i/4,vy=ymin+(ymax-ymin)*i/4;p.push(line(x(vx),80,x(vx),20,{role:'muted',dashed:true}),line(16,y(vy),84,y(vy),{role:'muted',dashed:true}),label(x(vx)-2,87,String(Number(vx.toPrecision(4)))),label(2,y(vy),String(Number(vy.toPrecision(4)))));}
  p.push({kind:'polyline',points:t.points.map((pt:any)=>({x:x(pt.x),y:y(pt.y)})),role:'accent'});return {primitives:p};
 }
 if(t.kind==='apparatus'){const p=apparatus(t.scene);return p?{primitives:p}:null;}
 return null;
}

export function normalizeScienceDiagram(value:any,candidates:LibraryImageRef[]=[]):ScienceDiagram|null{
 if(!value||typeof value!=='object')return null;
 const confidence=finite(value.confidence)?Math.max(0,Math.min(100,value.confidence)):0;if(confidence<70)return null;
 const libraryImages=Array.isArray(value.libraryImageIds)?candidates.filter(c=>value.libraryImageIds.includes(c.id)).slice(0,2):[];
 const compiled=value.template?compileTemplate(value.template):null;
 // Invalid structured diagrams are rejected, never silently replaced by guessed geometry.
 if(value.template&&!compiled&&!libraryImages.length)return null;
 let primitives:P[]=compiled?.primitives||[];
 if(!value.template&&Array.isArray(value.primitives))primitives=value.primitives.slice(0,160).flatMap((p:any)=>{
  if(!p||!['line','arrow','circle','rect','label','polyline','arc'].includes(p.kind))return [];
  const keys:Record<string,string[]>={line:['x1','y1','x2','y2'],arrow:['x1','y1','x2','y2'],circle:['cx','cy','r'],rect:['x','y','width','height'],label:['x','y'],arc:['cx','cy','r','startAngle','endAngle'],polyline:[]};
  if(keys[p.kind].some(k=>!finite(p[k])))return [];
  if(p.kind==='polyline'&&(!Array.isArray(p.points)||p.points.length<2||p.points.some((pt:any)=>!finite(pt.x)||!finite(pt.y))))return [];
  const out:any={kind:p.kind,role:['primary','secondary','accent','muted'].includes(p.role)?p.role:'primary',dashed:!!p.dashed,text:text(p.text,48),note:text(p.note,180)};
  for(const k of keys[p.kind])out[k]=k.includes('Angle')?Math.max(-360,Math.min(360,p[k])):bound(p[k]);
  if(p.kind==='polyline')out.points=p.points.slice(0,100).map((pt:any)=>({x:bound(pt.x),y:bound(pt.y)}));return [out];
 });
 if(primitives.length<2&&!compiled?.table&&!libraryImages.length)return null;
 const types=['force','incline','circular_motion','spring','pulley','optics','circuit','earth_layers','fault','plate_boundary','sun_angle','earth_moon_sun','atmosphere','ocean_circulation','chemistry_apparatus','motion_graph','coordinate_graph','wave','vector','phase_diagram','generic'];
 return {type:(types.includes(value.type)?value.type:'generic') as ScienceDiagram['type'],title:text(value.title,60)||'科學圖解',caption:text(value.caption,240),confidence,primitives,...(compiled?.table?{table:compiled.table}:{}),...(libraryImages.length?{libraryImages}: {})};
}

export const SCIENCE_TEMPLATE_PROMPT=`
科學繪圖引擎 v2：優先用下列結構化 template，程式會負責精確格線、刻度與器材配置，取代逐線自由排版。diagram 為 {type,title,caption,confidence,template,libraryImageIds:[]}。只畫題目支持的內容；diagram 關閉時仍必須為 null。不確定的圖不得輸出。不要把參考示意圖當成題目資料。
1. 受力圖 template={kind:"force",object:"物體",forces:[{label:"重力 mg",angle:270,magnitude:10},{label:"正向力 N",angle:90,magnitude:10}]}。angle 為數學角度：右0、上90、左180、下270；magnitude 為相同單位的正數，相對長度等比例。未知力大小或平衡條件不可擅自猜測，改用一般 primitives 並註明不按比例。
2. 表格 template={kind:"table",headers:["項目","數值"],rows:[["質量","2 kg"],["加速度","3 m/s²"]]}。每列欄數必須一致，最多8欄20列。
3. 九宮格／格線 template={kind:"grid",rows:3,columns:3,cells:[{row:0,column:0,text:"A"}]}，格子索引從0開始，最多8×8。
4. 座標曲線 template={kind:"plot",xRange:[0,4],yRange:[0,8],xLabel:"t (s)",yLabel:"v (m/s)",points:[{x:0,y:0},{x:4,y:8}]}。範圍必須涵蓋所有點，依順序連線；曲線須給足夠採樣點，數值與單位必須依題目。
5. 實驗裝置 template={kind:"apparatus",scene:"filtration"}。scene 可用 filtration（重力過濾）、titration（滴定）、distillation（簡易蒸餾）。這些是固定配置的基本示意圖，只有符合題目配置才使用，caption 註明為示意、不按比例；特殊裝置改用提供的講義圖或一般 primitives。
6. 自由幾何仍可輸出 primitives，最多160個；不得輸出SVG字串、程式碼或外部圖片網址。
7. 有候選講義圖時，只能從候選ID選最多2張放入 libraryImageIds。需確定與題意、器材及連接方式相符；不符時不要附圖，不能為了附圖改變解題結論。
`;
