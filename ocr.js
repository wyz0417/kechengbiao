import {uid} from './model.js';
// Convert OCR word coordinates into editable course candidates. Nothing is imported without review.
export function parseWords(words,width,height,dayCount=7,periods=12) {
 const clean=words.filter(w=>w.text?.trim() && w.bbox && w.confidence>15).map(w=>({...w,text:w.text.trim(),x:(w.bbox.x0+w.bbox.x1)/2,y:(w.bbox.y0+w.bbox.y1)/2}));
 const aliases=[/^(周|星期|礼拜)[一1]$/, /^(周|星期|礼拜)[二2]$/, /^(周|星期|礼拜)[三3]$/, /^(周|星期|礼拜)[四4]$/, /^(周|星期|礼拜)[五5]$/, /^(周|星期|礼拜)[六6]$/, /^(周|星期|礼拜)[日天7]$/];
 // Chinese OCR sometimes splits a heading into separate words; join nearby words on the same baseline.
 const combined=[...clean];
 for(const w of clean) { if(/^(周|星期|礼拜)$/.test(w.text)) {const next=clean.find(v=>v.x>w.x && Math.abs(v.y-w.y)<12 && v.bbox.x0-w.bbox.x1<30 && /^[一二三四五六日天]$/.test(v.text)); if(next)combined.push({...w,text:w.text+next.text,x:(w.bbox.x0+next.bbox.x1)/2});}}
 const headers=aliases.slice(0,dayCount).map(re=>combined.find(w=>re.test(w.text.replace(/\s/g,''))));
 const found=headers.map((v,i)=>v?{...v,day:i}:null).filter(Boolean);
 let left=width*.105,cellWidth=(width-left)/dayCount,top=height*.12;
 if(found.length>=2) {const first=found[0],last=found.at(-1); cellWidth=(last.x-first.x)/(last.day-first.day); left=first.x-cellWidth*(first.day+.5); top=Math.max(...found.map(w=>w.bbox.y1))+8;}
 const markers=clean.filter(w=>w.x<left && /^(第)?\d{1,2}(节)?$/.test(w.text)).map(w=>({...w,n:Number(w.text.replace(/\D/g,''))})).filter(w=>w.n>=1&&w.n<=periods&&w.y>top);
 const unique=[...new Map(markers.map(w=>[w.n,w])).values()].sort((a,b)=>a.n-b.n);
 let rowHeight=(height-top)/periods;
 if(unique.length>=2) {const a=unique[0],b=unique.at(-1); rowHeight=(b.y-a.y)/(b.n-a.n); top=a.y-(a.n-.5)*rowHeight;}
 if(rowHeight<5) rowHeight=(height-top)/periods;
 const result=[];
 for(let day=0;day<dayCount;day++) {
  const column=clean.filter(w=>w.x>=left+day*cellWidth&&w.x<left+(day+1)*cellWidth&&w.y>top&&!/^(周|星期|礼拜)[一二三四五六日天1-7]$/.test(w.text)).sort((a,b)=>a.y-b.y||a.x-b.x);
  const lines=[];
  for(const w of column){let line=lines.find(l=>Math.abs(l.y-w.y)<Math.max(6,(w.bbox.y1-w.bbox.y0)*.55)); if(!line){line={y:w.y,words:[]};lines.push(line);}line.words.push(w);}
  const blocks=[];
  for(const l of lines){const prev=blocks.at(-1),text=l.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join('');if(!text)continue;const h=Math.max(...l.words.map(w=>w.bbox.y1-w.bbox.y0));if(prev&&l.y-prev.last<Math.max(h*2, rowHeight*.4)){prev.lines.push(text);prev.last=l.y;}else blocks.push({lines:[text],first:l.y,last:l.y});}
  for(const b of blocks){if(!/[\u4e00-\u9fffA-Za-z]{2}/.test(b.lines.join('')))continue;let start=Math.max(1,Math.min(periods,Math.floor((b.first-top)/rowHeight)+1));let end=Math.min(periods,Math.max(start+1,Math.floor((b.last-top)/rowHeight)+1));const range=b.lines.join(' ').match(/(?:第)?(\d{1,2})\s*[-~～—至]\s*(\d{1,2})\s*节/);if(range && +range[1]>0&&+range[2]<=periods){start=+range[1];end=+range[2];}result.push({id:uid(),name:b.lines[0].slice(0,80),location:b.lines.slice(1).join(' · ').slice(0,160),day,start,end});}
 }
 return result;
}
