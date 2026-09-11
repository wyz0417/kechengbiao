import {uid} from './model.js';

function runs(values,minRatio){const positions=[];let start=-1;for(let i=0;i<=values.length;i++){if(values[i]>=minRatio){if(start<0)start=i;}else if(start>=0){positions.push(Math.round((start+i-1)/2));start=-1;}}return positions;}
export function detectGrid(canvas){
 const {width:w,height:h}=canvas,ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,w,h).data;
 const xs=new Float32Array(w),ys=new Float32Array(h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(pixels[i]<125&&pixels[i+1]<125&&pixels[i+2]<125){xs[x]+=1/h;ys[y]+=1/w;}}
 const vertical=runs(xs,.48),horizontal=runs(ys,.55);
 const gaps=vertical.slice(1).map((x,i)=>({left:vertical[i],right:x,width:x-vertical[i]})).filter(g=>g.width>w*.075);
 if(gaps.length<5||horizontal.length<3)return null;
 const widths=gaps.map(g=>g.width).sort((a,b)=>a-b),median=widths[Math.floor(widths.length/2)];
 const columns=gaps.filter(g=>Math.abs(g.width-median)<median*.18).slice(0,7);
 if(columns.length<5)return null;
 const cells=[];
 for(let day=0;day<columns.length;day++)for(let i=1;i<horizontal.length;i++){
  const {left,right}=columns[day],top=horizontal[i-1],bottom=horizontal[i];if(bottom-top<Math.max(55,h*.03))continue;
  const x0=left+3,x1=right-3,y0=top+3,y1=bottom-3;let ink=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const p=(y*w+x)*4;if(pixels[p]<145&&pixels[p+1]<145&&pixels[p+2]<145)ink++;}
  if(ink<Math.max(180,(x1-x0)*(y1-y0)*.004))continue;
  cells.push({day,x:x0,y:y0,width:x1-x0,height:y1-y0});
 }
 return cells.length?{columns:columns.length,cells}:null;
}
const normalize=text=>text.replace(/\s/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[—–~～]/g,'-');
const schedulePattern=/(\d{1,2})-(\d{1,2})周[^\d]*(\d{1,2})[^\d]+(\d{1,2})/;
export function parseCellText(text,day){
 const lines=text.split(/\r?\n/).map(normalize).filter(Boolean);
 const schedules=lines.map((line,index)=>({index,match:line.match(schedulePattern)})).filter(v=>v.match);
 const codes=lines.map((line,index)=>/^\(?\d{7,}[A-Za-z\d-]+/.test(line)?index:-1).filter(i=>i>=0);
 const result=[];let previousSchedule=-1;
 for(let si=0;si<schedules.length;si++){
  const {index,match}=schedules[si];const code=codes.filter(i=>i<index&&i>previousSchedule).at(-1);
  let begin=previousSchedule+1;
  if(previousSchedule>=0){for(let j=previousSchedule+1;j<(code??index-1);j++){if(/校区|操场|实验室/.test(lines[j])||/^\(?\d{3,}[\d()-]*$/.test(lines[j]))begin=j+1;}}
  const nameEnd=code??Math.max(begin+1,index-1);
  let name=lines.slice(begin,nameEnd).join('').replace(/^\|+/,'');
  name=name.replace(/\|V/g,'IV').replace(/\|\|/g,'II');
  let end=si+1<schedules.length?(codes.find(c=>c>index)??schedules[si+1].index):lines.length;
  // Stop the location before the following course title; campus and room lines are metadata.
  const metadata=[];for(let j=index+1;j<end;j++){if(/校区|操场|实验室|虚拟/.test(lines[j])||/^[()\d-]+$/.test(lines[j]))metadata.push(lines[j]);else break;}
  const weekStart=+match[1],weekEnd=+match[2],start=+match[3],finish=+match[4];
  if(name&&weekStart>=1&&weekEnd>=weekStart&&weekEnd<=60&&start>=1&&finish>=start&&finish<=14)result.push({id:uid(),name:name.slice(0,80),location:metadata.join(' · ').slice(0,160),day,start,end:finish,weekStart,weekEnd});
  previousSchedule=index;
 }
 return result;
}
export async function recognizeGridLines(worker,canvas,grid,onProgress){
 const courses=[],raw=[],source=canvas.getContext('2d');await worker.reinitialize('chi_sim');await worker.setParameters({tessedit_pageseg_mode:'7'});
 for(let i=0;i<grid.cells.length;i++){
  const cell=grid.cells[i],pixels=source.getImageData(cell.x,cell.y,cell.width,cell.height).data;
  const bands=[];let begin=-1;
  for(let y=0;y<=cell.height;y++){let ink=0;for(let x=0;x<cell.width&&y<cell.height;x++){const p=(y*cell.width+x)*4;if(pixels[p]<155&&pixels[p+1]<155&&pixels[p+2]<155)ink++;}if(ink>=3){if(begin<0)begin=y;}else if(begin>=0){if(y-begin>=5)bands.push([begin,y]);begin=-1;}}
  const lines=[];
  for(const [top,bottom] of bands){const crop=document.createElement('canvas');crop.width=cell.width*3+48;crop.height=(bottom-top)*3+48;const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);ctx.drawImage(canvas,cell.x,cell.y+top,cell.width,bottom-top,24,24,cell.width*3,(bottom-top)*3);const {data}=await worker.recognize(crop);lines.push(data.text.trim());}
  const text=lines.join('\n');raw.push({cell,text});courses.push(...parseCellText(text,cell.day));onProgress?.(i+1,grid.cells.length);
 }
 return {courses,raw};
}
