import {uid} from './model.js';
import {extractCourseNames,isCourseNoise,mainCourseName} from './course-names.js';

function clusters(values,threshold){const found=[];let start=-1;for(let i=0;i<=values.length;i++){if(values[i]>=threshold){if(start<0)start=i;}else if(start>=0){found.push({at:Math.round((start+i-1)/2),score:Math.max(...values.slice(start,i))});start=-1;}}return found.filter((v,i,a)=>!i||v.at-a[i-1].at>4);}
function rowsFromWords(words){
 const rows=[];
 for(const word of words.filter(w=>w.text?.trim()&&w.bbox&&w.confidence>12).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){
  const height=word.bbox.y1-word.bbox.y0,center=(word.bbox.y0+word.bbox.y1)/2;
  let row=rows.find(r=>Math.abs(r.center-center)<Math.max(6,Math.min(r.height,height)*.65));
  if(!row){row={center,height,words:[]};rows.push(row);}row.words.push(word);
 }
 return rows.sort((a,b)=>a.center-b.center).map(r=>{const words=r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);return {text:words.map(w=>w.text).join(''),words,top:Math.min(...words.map(w=>w.bbox.y0)),bottom:Math.max(...words.map(w=>w.bbox.y1)),height:r.height};});
}
function headerAnchors(words,height){
 const headers=[];
 for(const row of rowsFromWords(words).filter(r=>r.top<height*.22)){
  const chars=[];for(const w of row.words){const text=w.text.replace(/\s/g,'');for(let i=0;i<text.length;i++)chars.push({char:text[i],x:w.bbox.x0+(i+.5)/text.length*(w.bbox.x1-w.bbox.x0)});}
  const line=chars.map(c=>c.char).join('');for(const match of line.matchAll(/(?:星期|礼拜|周)([一二三四五六日天])/g)){const day='一二三四五六日'.indexOf(match[1]==='天'?'日':match[1]);headers.push({day,x:chars[match.index+match[0].length-1].x-(chars[match.index+match[0].length-1].x-chars[match.index].x)/2,bottom:row.bottom});}
 }
 const unique=[...new Map(headers.map(h=>[h.day,h])).values()].sort((a,b)=>a.day-b.day);return unique.length>=4?unique:[];
}
function prepare(source){
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 const ctx=canvas.getContext('2d'),raw=source.getContext('2d').getImageData(0,0,source.width,source.height),{width:w,height:h}=source;
 const luminance=new Float32Array(w*h);let mean=0;
 for(let i=0;i<luminance.length;i++){const p=i*4;luminance[i]=.299*raw.data[p]+.587*raw.data[p+1]+.114*raw.data[p+2];mean+=luminance[i];}
 const dark=mean/luminance.length<128;if(dark)for(let i=0;i<luminance.length;i++)luminance[i]=255-luminance[i];
 const xs=new Float32Array(w),ys=new Float32Array(h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(Math.abs(luminance[i-1]-luminance[i+1])>9)xs[x]+=1/h;if(Math.abs(luminance[i-w]-luminance[i+w])>9)ys[y]+=1/w;}
 const output=ctx.createImageData(w,h);
 // Preserve glyph strokes on light screenshots; use a gentle inversion on dark themes.
 for(let i=0;i<luminance.length;i++){const p=i*4;if(dark){const color=Math.max(0,Math.min(255,(luminance[i]-80)*1.9));output.data[p]=output.data[p+1]=output.data[p+2]=color;}else{output.data[p]=raw.data[p];output.data[p+1]=raw.data[p+1];output.data[p+2]=raw.data[p+2];}output.data[p+3]=255;}
 ctx.putImageData(output,0,0);return {canvas,vertical:clusters(xs,.32),horizontal:clusters(ys,.53),dark};
}
function inferGeometry(vertical,horizontal,width,height){
 const edges=[];for(const v of vertical){const last=edges.at(-1);if(last&&v.at-last.at<16){if(v.score>last.score)edges[edges.length-1]=v;}else edges.push(v);}
 let best=[];
 for(const start of edges)for(const next of edges){const step=next.at-start.at;if(step<width*.09||step>width*.22)continue;const chain=[start.at];for(let n=1;n<=7;n++){const target=start.at+n*step,match=edges.filter(v=>Math.abs(v.at-target)<step*.1).sort((a,b)=>Math.abs(a.at-target)-Math.abs(b.at-target))[0];if(!match)break;chain.push(match.at);}if(chain.length>best.length)best=chain;}
 if(best.length<6)return null;
 const ys=horizontal.map(v=>v.at).filter(y=>y>height*.015);let top=ys[0]??height*.06;if(ys.length>1&&ys[1]-ys[0]<height*.09&&ys[0]>height*.04)top=ys[1];
 return {edges:best,count:best.length-1,top};
}
function geometry(headers,vertical,width){
 if(!headers.length)return null;
 const first=headers[0],last=headers.at(-1),step=(last.x-first.x)/(last.day-first.day),count=last.day+1,centers=Array.from({length:count},(_,i)=>headers.find(h=>h.day===i)?.x??first.x+(i-first.day)*step);
 const edges=Array.from({length:count+1},(_,i)=>{const target=i===0?centers[0]-step*.5:i===count?centers.at(-1)+step*.5:(centers[i-1]+centers[i])/2;const lo=i===0?0:centers[i-1]+5,hi=i===count?width:centers[i]-5;const candidates=vertical.filter(v=>v.at>lo&&v.at<hi);return candidates.length?candidates.sort((a,b)=>b.score-a.score||Math.abs(a.at-target)-Math.abs(b.at-target))[0].at:Math.max(0,Math.min(width,target));});
 return {edges,top:Math.max(...headers.map(h=>h.bottom)),count};
}
async function readRegion(worker,canvas,x,y,width,height){
 const crop=document.createElement('canvas');crop.width=Math.round(width*2)+24;crop.height=Math.round(height*2)+24;
 const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);ctx.drawImage(canvas,x,y,width,height,12,12,width*2,height*2);
 const pixels=ctx.getImageData(0,0,crop.width,crop.height).data,bands=[];let begin=-1;
 for(let row=0;row<=crop.height;row++){let ink=0;for(let col=0;row<crop.height&&col<crop.width;col++){const p=(row*crop.width+col)*4;if(pixels[p]*.299+pixels[p+1]*.587+pixels[p+2]*.114<185)ink++;}if(ink>=Math.max(12,crop.width*.035)){if(begin<0)begin=row;}else if(begin>=0){const last=bands.at(-1);if(last&&begin-last[1]<=5)last[1]=row;else bands.push([begin,row]);begin=-1;}}
 const lines=[];await worker.setParameters({tessedit_pageseg_mode:'7'});
 for(const [bandTop,bandBottom] of bands){if(bandBottom-bandTop<6)continue;const top=Math.max(0,bandTop-3),bottom=Math.min(crop.height,bandBottom+3),lineCanvas=document.createElement('canvas');lineCanvas.width=crop.width+32;lineCanvas.height=bottom-top+32;const lc=lineCanvas.getContext('2d');lc.fillStyle='white';lc.fillRect(0,0,lineCanvas.width,lineCanvas.height);lc.drawImage(crop,0,top,crop.width,bottom-top,16,16,crop.width,bottom-top);const {data:line}=await worker.recognize(lineCanvas);lines.push({text:line.text,top:y+(top-12)/2,bottom:y+(bottom-12)/2,height:(bandBottom-bandTop)/2});}
 return lines;
}
export async function recognizeNames(worker,source,onProgress=()=>{}){
 const prep=prepare(source),canvas=prep.canvas;await worker.reinitialize('chi_sim+eng');await worker.setParameters({tessedit_pageseg_mode:'11'});
 onProgress('正在定位课表与课程标题…',.05);const {data}=await worker.recognize(canvas);const headers=headerAnchors(data.words||[],canvas.height),fromHeaders=geometry(headers,prep.vertical,canvas.width),inferred=inferGeometry(prep.vertical,prep.horizontal,canvas.width,canvas.height),layout=inferred&&inferred.count>(fromHeaders?.count||0)?inferred:fromHeaders||inferred;
 const courses=[],raw=[],debug={headers,layout,vertical:prep.vertical,horizontal:prep.horizontal,text:data.text};
 if(!layout){
  const lines=rowsFromWords(data.words||[]);for(const name of extractCourseNames(lines)){courses.push({id:uid(),name,location:'',day:0,start:Math.min(14,courses.length+1),end:Math.min(14,courses.length+1)});}
  return {debug,courses,raw:[{text:data.text}],warning:'未能定位星期列，已提取课程名，请在导入前校对位置。'};
 }
 const horizontal=prep.horizontal.map(v=>v.at).filter(y=>y>layout.top-12);if(!horizontal.length||horizontal[0]>layout.top+12)horizontal.unshift(layout.top);if(horizontal.length<2)horizontal.push(canvas.height);
 const structured=horizontal.length>=3&&!prep.dark;
 if(structured){
  const regions=[],rawPixels=source.getContext('2d').getImageData(0,0,source.width,source.height).data;
  for(let day=0;day<layout.count;day++)for(let row=1;row<horizontal.length;row++){
   const x=layout.edges[day]+4,right=layout.edges[day+1]-4,y=horizontal[row-1]+4,bottom=horizontal[row]-4;if(right-x<25||bottom-y<10)continue;
   const divider=at=>{let edges=0;for(let yy=Math.ceil(y);yy<bottom;yy++){let min=255,max=0;for(let xx=Math.max(0,Math.round(at)-3);xx<=Math.min(source.width-1,Math.round(at)+3);xx++){const p=(yy*source.width+xx)*4,v=rawPixels[p]*.299+rawPixels[p+1]*.587+rawPixels[p+2]*.114;min=Math.min(min,v);max=Math.max(max,v);}if(max-min>9)edges++;}return edges/(bottom-y)>.3;};
   if(!divider(layout.edges[day])||!divider(layout.edges[day+1]))continue;
   const words=(data.words||[]).filter(w=>w.bbox.x0>=x-4&&w.bbox.x1<=right+4&&w.bbox.y0>=y-3&&w.bbox.y1<=bottom+3);
   const lines=rowsFromWords(words);if(!lines.length)continue;
   regions.push({day,row,x,y,width:right-x,height:bottom-y});
  }
  await worker.setParameters({tessedit_pageseg_mode:'7'});
  for(let i=0;i<regions.length;i++){
   const {day,row,x,y,width,height}=regions[i],lines=await readRegion(worker,canvas,x,y,width,height);
   const names=extractCourseNames(lines);raw.push({day,row,text:lines.map(l=>l.text).join('\n'),lines});for(const name of names)courses.push({id:uid(),name,location:'',day,start:Math.min(14,row),end:Math.min(14,row)});onProgress(`正在提取课程主名称… ${i+1}/${regions.length}`,.15+.85*(i+1)/regions.length);
  }
 }else{
  for(let day=0;day<layout.count;day++){
   const lines=await readRegion(worker,canvas,layout.edges[day]+6,layout.top+4,layout.edges[day+1]-layout.edges[day]-12,canvas.height-layout.top-4);let group=[];
   const flush=()=>{for(const name of extractCourseNames(group)){const row=Math.max(1,Math.min(14,Math.round((group[0]?.top||layout.top)/canvas.height*12)));courses.push({id:uid(),name,location:'',day,start:row,end:row});}group=[];};
   for(const line of lines){if(group.length&&line.top-group.at(-1).bottom>line.height*1.7)flush();group.push(line);}flush();raw.push({day,text:lines.map(l=>l.text).join('\n')});
  }
 }
 // Complete a one-character truncation only when the longer title repeats in this image.
 const counts=new Map();for(const c of courses)counts.set(c.name,(counts.get(c.name)||0)+1);
 for(const c of courses){const matches=[...counts].filter(([name,n])=>n>=2&&c.name.length>=5&&name.length===c.name.length+1&&name.startsWith(c.name));if(matches.length===1)c.name=matches[0][0];}
 const positions=[...new Set(courses.map(c=>c.start))].sort((a,b)=>a-b);
 for(const c of courses)c.start=c.end=positions.indexOf(c.start)+1;
 const unique=new Map();for(const c of courses){if(!isCourseNoise(mainCourseName(c.name)))unique.set(`${c.day}:${c.start}:${c.name}`,c);}
 return {debug,courses:[...unique.values()],raw,columns:layout.count};
}
