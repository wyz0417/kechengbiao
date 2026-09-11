export const DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
export const STAGES = ['未开始','复习过','整理笔记','刷过题'];
export function uid(){return globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
export function monday(date = new Date()) { const d=new Date(date); d.setHours(12,0,0,0); d.setDate(d.getDate()-(d.getDay()+6)%7); return localDate(d); }
export function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function addDays(date,n) { const d=new Date(date+'T12:00:00'); d.setDate(d.getDate()+n); return localDate(d); }
export function progressKey(state,course,week) {return state.scope==='term' ? `term:${course.name.trim()}` : `${week}:${course.id}`;}
export function stage(state,course,week) {return state.progress[progressKey(state,course,week)] || 0;}
export function teachingWeek(state,week){return Math.round((new Date(week+'T12:00:00')-new Date(state.termStart+'T12:00:00'))/604800000)+1;}
export function activeCourses(state,week){const n=teachingWeek(state,week);return state.courses.filter(c=>(c.weekStart==null||n>=c.weekStart)&&(c.weekEnd==null||n<=c.weekEnd));}
export function courseLanes(courses){
 const layout=new Map();
 for(let day=0;day<7;day++){
  const sorted=courses.filter(c=>c.day===day).sort((a,b)=>a.start-b.start||a.end-b.end);let group=[],end=0;
  const finish=()=>{const ends=[];for(const c of group){let lane=ends.findIndex(e=>e<c.start);if(lane<0)lane=ends.length;ends[lane]=c.end;layout.set(c.id,{lane,count:0});}for(const c of group)layout.get(c.id).count=ends.length;};
  for(const c of sorted){if(group.length&&c.start>end){finish();group=[];end=0;}group.push(c);end=Math.max(end,c.end);}finish();
 }return layout;
}
export function validateState(s) {
 if(!s || s.version!==1 || !Array.isArray(s.courses) || s.courses.length>500 || !s.progress || typeof s.progress!=='object' || Array.isArray(s.progress) || !['week','term'].includes(s.scope) || typeof s.title!=='string' || s.title.length>40 || !/^\d{4}-\d{2}-\d{2}$/.test(s.termStart) || !Number.isFinite(Date.parse(s.termStart)) || !Number.isInteger(s.periods) || s.periods<1 || s.periods>14) throw new Error('备份格式不正确');
 const ids=new Set();
 for(const c of s.courses) {if(!c || typeof c.id!=='string' || c.id.length>100 || ids.has(c.id) || typeof c.name!=='string' || !c.name.trim() || c.name.length>80 || typeof c.location!=='string' || c.location.length>160 || !Number.isInteger(c.day) || c.day<0 || c.day>6 || !Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start<1 || c.end<c.start || c.end>s.periods) throw new Error('课程数据不合法');if((c.weekStart!=null||c.weekEnd!=null)&&(!Number.isInteger(c.weekStart)||!Number.isInteger(c.weekEnd)||c.weekStart<1||c.weekEnd<c.weekStart||c.weekEnd>60))throw new Error('教学周范围不合法'); ids.add(c.id);}
 if(Object.keys(s.progress).length>50000 || Object.values(s.progress).some(v=>!Number.isInteger(v)||v<0||v>3)) throw new Error('进度数据不合法');
 return {version:1,namesOnly:s.namesOnly!==false,title:s.title,termStart:s.termStart,scope:s.scope,periods:s.periods,demo:!!s.demo,courses:s.courses.map(c=>({id:c.id,name:c.name,location:c.location,day:c.day,start:c.start,end:c.end,...(c.weekStart!=null?{weekStart:c.weekStart,weekEnd:c.weekEnd}:{})})),progress:{...s.progress}};
}
export function sampleState() {
 const data=[['高等数学','博学楼 A302',0,1,2],['大学英语','文科楼 B205',0,5,6],['程序设计基础','计算机楼 403',0,9,10],['线性代数','博学楼 A201',1,3,4],['大学物理','理科楼 C102',1,7,8],['高等数学','博学楼 A302',2,1,2],['思想道德与法治','综合楼 201',2,5,6],['大学英语','文科楼 B205',3,3,4],['程序设计基础','计算机楼 403',3,7,8],['体育','东区运动场',4,1,2],['线性代数','博学楼 A201',4,5,6],['自主学习','图书馆 · 给自己一点时间',5,3,4]];
 const courses=data.map((c,i)=>({id:`sample-${i}`,name:c[0],location:c[1],day:c[2],start:c[3],end:c[4]}));
 const progress={}; [3,1,0,2,1,2,0,1,3,0,2,0].forEach((n,i)=>progress[`${monday()}:sample-${i}`]=n);
 return {version:1,title:'我的课程表',termStart:monday(),scope:'week',periods:12,demo:true,courses,progress};
}
