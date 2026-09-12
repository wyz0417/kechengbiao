import {DAYS,STAGES,uid,monday,localDate,addDays,progressKey,stage,validateState,sampleState,courseLanes,activeCourses} from './model.js';
import {parseWords} from './ocr.js';
import {detectGrid,recognizeGridLines,parseCellText} from './grid-ocr.js';
import {recognizeNames} from './name-ocr.js';
import {mainCourseName} from './course-names.js';
const $=id=>document.getElementById(id), key='jianxi-v1';
let state,week=monday(),view='grid',selectedDay=(new Date().getDay()+6)%7,editId=null,undoState=null,toastTimer,fileUrl=null,candidates=[],busy=false,user=null,revision=0,syncTimer,syncing=false,pendingSync=false;
let ocrRun=null;
let candidateMode='names',settingsDraft=false;
function importMode(){ $('import-options').hidden=$('recognition-mode').value==='names';$('import-term-field').hidden=$('recognition-mode').value==='names'; }
$('recognition-mode').onchange=importMode;
function clearUpload(){
 if(ocrRun){ocrRun.controller.abort();ocrRun.worker?.terminate().catch(()=>{});ocrRun=null;}
 busy=false;$('manual-import').disabled=false;$('import-feedback').hidden=true;$('recognition-mode').disabled=false;if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=null;candidates=[];
 $('image-input').value='';$('image-input').disabled=false;$('preview-image').removeAttribute('src');
 $('image-preview').hidden=true;$('image-actions').hidden=true;$('review-section').hidden=true;
 $('review-courses').replaceChildren();$('ocr-unparsed').textContent='';$('ocr-unparsed').hidden=true;
 $('confirm-import').hidden=true;$('confirm-import').disabled=true;$('recognize').hidden=false;$('recognize').disabled=true;
 $('ocr-progress').value=0;$('ocr-progress').hidden=true;$('ocr-status').textContent='图片已删除，请重新上传。';
}
$('delete-image').onclick=clearUpload;
try {const saved=localStorage.getItem(key);state=saved?validateState(JSON.parse(saved)):sampleState();}catch{state=sampleState();setTimeout(()=>toast('本地数据无法读取，已显示示例。原数据未自动覆盖。'),100);}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message,undo=false){clearTimeout(toastTimer);$('toast-text').textContent=message;$('undo').hidden=!undo;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function persist(){try{localStorage.setItem(key,JSON.stringify(state));if(user)localStorage.setItem(key+'-dirty','1');$('save-state').textContent=user?'● 等待同步':'● 已保存在此设备';}catch{$('save-state').textContent='保存失败，请导出备份';toast('浏览器存储空间不足，请导出备份。');} if(user){pendingSync=true;clearTimeout(syncTimer);syncTimer=setTimeout(sync,500);}}
function mutate(fn,message){undoState=structuredClone(state);fn();persist();render();if(message)toast(message,true);}
$('undo').onclick=()=>{if(!undoState)return;state=undoState;undoState=null;persist();render();toast('已撤销上一步操作');};
function card(c){const n=stage(state,c,week),simple=state.namesOnly!==false;return `<article class="course s${n}" data-id="${esc(c.id)}"><button class="course-main" data-advance="${esc(c.id)}" aria-label="${esc(c.name)}，${STAGES[n]}，${n<3?'点击标记'+STAGES[n+1]:'已完成'}"><strong>${esc(simple?mainCourseName(c.name):c.name)}</strong>${simple?'':`<span class="location">${esc(c.location)}</span><span class="course-period">第 ${c.start}–${c.end} 节${c.weekStart!=null?` · ${c.weekStart}–${c.weekEnd} 周`:''}</span>`}<span class="course-status"><i class="status-dot"></i>${STAGES[n]}${n===3?' ✓':''}</span></button><button class="course-edit" data-edit="${esc(c.id)}" aria-label="编辑${esc(c.name)}">⋯</button></article>`;}
function render(){
 $('first-use-note').hidden=!state.demo;$('table-title').textContent=state.title;$('demo-label').hidden=!state.demo;
 const scheduled=activeCourses(state,week);const statuses=scheduled.map(c=>stage(state,c,week));$('stat-total').textContent=statuses.length;$('stat-started').textContent=statuses.filter(n=>n>0).length;$('stat-done').textContent=statuses.filter(n=>n===3).length;const pct=statuses.length?Math.round(statuses.reduce((a,b)=>a+b,0)/statuses.length/3*100):0;$('stat-percent').innerHTML=pct+'<em>%</em>';$('progress-bar').style.width=pct+'%';
 const weekNo=Math.round((new Date(week+'T12:00:00')-new Date(state.termStart+'T12:00:00'))/604800000)+1;$('week-title').textContent=weekNo>0?`第 ${weekNo} 周`:'学期开始前';$('week-range').textContent=`${week.slice(5).replace('-','.')} – ${addDays(week,6).slice(5).replace('-','.')}`;
 const mobile=matchMedia('(max-width:640px)').matches;
 $('mobile-days').innerHTML=DAYS.map((d,i)=>`<button data-day="${i}" class="${i===selectedDay?'active':''}" aria-pressed="${i===selectedDay}">${d}<br>${addDays(week,i).slice(8)}</button>`).join('');
 let html='<div class="day-head">'+(state.namesOnly!==false?'位置':'节次')+'</div>'+DAYS.map((d,i)=>`<div class="day-head ${addDays(week,i)===localDate(new Date())?'today-head':''}"><strong>${d}</strong><span>${addDays(week,i).slice(5).replace('-',' / ')}</span></div>`).join('');
 for(let p=1;p<=state.periods;p++){const row=p+(mobile?0:1);html+=`<div class="period" style="grid-row:${row};grid-column:1">${String(p).padStart(2,'0')}</div>`;for(let d=0;d<(mobile?1:7);d++)html+=`<div class="grid-cell" style="grid-row:${row};grid-column:${d+2}"></div>`;}
 const visible=scheduled.filter(c=>!mobile||c.day===selectedDay);
 $('board-empty').hidden=!!(mobile?visible.length:scheduled.length)||view==='list';$('board-empty').textContent=!state.courses.length?'还没有课程。点击“导入课程表”或“添加课程”开始。':!scheduled.length?'本周没有课程。可切换周次；有教学周限制的课程请在课表设置中核对学期日期。':`${DAYS[selectedDay]}没有课程，请选择其他日期，或切换“列表”查看本周全部课程。`;
 // Distribute overlapping courses within the same day instead of hiding one under another.
 const lanes=courseLanes(visible);
 for(const c of visible){const {lane,count}=lanes.get(c.id);html+=card(c).replace('<article ',`<article style="grid-column:${mobile?2:c.day+2};grid-row:${c.start+(mobile?0:1)} / ${c.end+(mobile?1:2)};${count>1?`margin-left:calc(${lane/count*100}% + 3px);margin-right:calc(${(count-lane-1)/count*100}% + 3px);`:''}" `);}
 $('timetable').innerHTML=html;$('timetable').hidden=view!=='grid';$('course-list').hidden=view!=='list';$('mobile-days').hidden=view!=='grid';
 $('course-list').innerHTML=scheduled.length?DAYS.map((d,i)=>{const cs=scheduled.filter(c=>c.day===i).sort((a,b)=>a.start-b.start);return cs.length?`<section class="list-day"><h3>${d} · ${addDays(week,i)}</h3><div>${cs.map(card).join('')}</div></section>`:'';}).join(''):`<div class="empty">${state.courses.length?'本周没有安排课程，可切换周次或检查学期开始日期。':'还没有课程，导入课表或添加第一节课吧。'}</div>`;
 $('grid-view').classList.toggle('active',view==='grid');$('list-view').classList.toggle('active',view==='list');
}
document.addEventListener('click',e=>{const advance=e.target.closest('[data-advance]'),edit=e.target.closest('[data-edit]'),day=e.target.closest('[data-day]'),close=e.target.closest('[data-close]');if(advance){const c=state.courses.find(c=>c.id===advance.dataset.advance),n=stage(state,c,week);if(n===3){toast('这节课已完成刷题！可在编辑中调整阶段。');return;}mutate(()=>state.progress[progressKey(state,c,week)]=n+1,`${c.name} · 已标记${STAGES[n+1]}`);}if(edit)openEditor(edit.dataset.edit);if(day){selectedDay=+day.dataset.day;render();}if(close)$(close.dataset.close).close();});
$('prev-week').onclick=()=>{week=addDays(week,-7);render();};$('next-week').onclick=()=>{week=addDays(week,7);render();};$('this-week').onclick=()=>{week=monday();render();};$('grid-view').onclick=()=>{view='grid';render();};$('list-view').onclick=()=>{view='list';render();};matchMedia('(max-width:640px)').addEventListener('change',render);
function openEditor(id=null){editId=id;const c=state.courses.find(c=>c.id===id)||{name:'',location:'',day:selectedDay,start:1,end:2};$('edit-title').textContent=id?'编辑课程':'添加课程';$('edit-name').value=c.name;$('edit-location').value=c.location;$('edit-day').innerHTML=DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join('');$('edit-day').value=c.day;$('edit-start').value=c.start;$('edit-end').value=c.end;$('edit-week-start').value=c.weekStart??'';$('edit-week-end').value=c.weekEnd??'';$('edit-status').value=id?stage(state,c,week):0;$('delete-course').hidden=!id;$('edit-dialog').showModal();}
$('add-course').onclick=()=>openEditor();$('edit-form').onsubmit=e=>{e.preventDefault();const c={id:editId||uid(),name:$('edit-name').value.trim(),location:$('edit-location').value.trim(),day:+$('edit-day').value,start:+$('edit-start').value,end:+$('edit-end').value};if($('edit-week-start').value||$('edit-week-end').value){c.weekStart=+$('edit-week-start').value;c.weekEnd=+$('edit-week-end').value;}try{validateState({...state,periods:Math.max(state.periods,c.end),courses:[c]});}catch{toast('请核对课程名称、节次和完整的起止教学周');return;}mutate(()=>{if(!editId&&state.demo){state.courses=[];state.progress={};state.demo=false;}const old=state.courses.findIndex(v=>v.id===c.id);if(old<0)state.courses.push(c);else state.courses[old]=c;state.periods=Math.max(state.periods,c.end);state.progress[progressKey(state,c,week)]=+$('edit-status').value;},'课程已保存');$('edit-dialog').close();};
$('delete-course').onclick=()=>{mutate(()=>{state.courses=state.courses.filter(c=>c.id!==editId);},'课程已删除');$('edit-dialog').close();};
function openSettings(){if(!settingsDraft){$('setting-title').value=state.title;$('setting-date').value=state.termStart;$('setting-scope').value=state.scope;settingsDraft=true;}$('settings-dialog').showModal();}
$('term-date-open').onclick=()=>{$('term-first-monday').value=state.termStart;$('term-date-error').hidden=true;$('term-date-dialog').showModal();};
$('term-date-form').onsubmit=e=>{e.preventDefault();const value=$('term-first-monday').value;if(!value||new Date(value+'T12:00:00').getDay()!==1){$('term-date-error').textContent='请选择星期一作为学期第一天。';$('term-date-error').hidden=false;return;}const previous=state.termStart;mutate(()=>{state.termStart=value;},'学期开始日期已更新');if(settingsDraft&&$('setting-date').value===previous)$('setting-date').value=value;if($('import-term').value===previous)$('import-term').value=value;$('term-date-dialog').close();};
$('settings-open').onclick=openSettings;$('account-open').onclick=()=>$('help-dialog').showModal();$('settings-save').onclick=()=>{if(!$('setting-date').value||!$('setting-title').value.trim()){toast('请填写课表名称和学期日期');return;}mutate(()=>{state.title=$('setting-title').value.trim();state.termStart=monday(new Date($('setting-date').value+'T12:00:00'));state.scope=$('setting-scope').value;},'设置已保存');settingsDraft=false;$('settings-dialog').close();};$('help-open').onclick=()=>$('help-dialog').showModal();
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`渐习课表-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出，可在其他设备导入');};
$('upload-open').onclick=()=>{if(!state.demo&&state.namesOnly===false&&!$('import-term').value)$('import-term').value=state.termStart;$('replace-note').textContent=state.demo?'确认后生成你的课表，示例课程会移除。': '确认后替换当前课表和进度。已有学习记录时，请先返回首页导出备份。';$('import-dialog').showModal();};$('backup-import').onclick=()=>$('backup-file').click();$('backup-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw new Error('备份文件超过 2 MB');const incoming=validateState(JSON.parse(await file.text()));if(!state.demo&&state.courses.length&&!confirm('导入备份将替换当前课表和进度，是否继续？'))return;mutate(()=>state=incoming,'备份已导入');finishImport();}catch(err){importError('备份未导入：请使用本产品导出的备份文件（最大 2 MB）。当前课表保持原样。');}finally{e.target.value='';}};
async function selectImage(file){if(busy)return;if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){importError('请选择 PNG、JPG 或 WebP 图片。当前已选图片会保留。');return;}if(file.size>12*1024*1024){importError('图片超过 12 MB，请压缩图片或裁去课表外的内容后重新选择。');return;}$('import-feedback').hidden=true;if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=URL.createObjectURL(file);candidates=[];$('preview-image').src=fileUrl;$('image-preview').hidden=false;$('image-actions').hidden=false;$('review-section').hidden=true;$('review-courses').replaceChildren();$('ocr-unparsed').hidden=true;$('confirm-import').hidden=true;$('recognize').hidden=false;$('recognize').disabled=false;$('ocr-status').textContent='图片已就绪，可以开始识别';}
$('image-input').onchange=e=>selectImage(e.target.files[0]);for(const type of ['dragover','dragleave','drop'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.toggle('dragging',type==='dragover');if(type==='drop')selectImage(e.dataTransfer.files[0]);});
function importError(message){$('import-feedback').textContent=message;$('import-feedback').hidden=!message;}
function validateCandidates(){
 const issues=[];candidates.forEach((c,i)=>{if(!c.name.trim())issues.push(`第 ${i+1} 项缺少课程名称`);if(c.start<1||c.end<c.start||c.end>14)issues.push(`第 ${i+1} 项的结束位置不能早于开始位置，范围为 1–14`);if((c.weekStart!=null||c.weekEnd!=null)&&(!c.weekStart||!c.weekEnd||c.weekEnd<c.weekStart||c.weekEnd>60))issues.push(`第 ${i+1} 项需要完整且有先后顺序的教学周范围（1–60）`);});
 if(candidateMode==='full'&&candidates.some(c=>c.weekStart!=null||c.weekEnd!=null)&&!$('import-term').value)issues.push('请填写上方的学期第一周日期，用于安排有教学周范围的课程');
 $('confirm-import').disabled=!candidates.length||!!issues.length;importError(issues.length?'导入前请补齐：'+issues.join('；')+'。':'');return !issues.length&&!!candidates.length;
}
$('import-term').oninput=()=>{if(!$('review-section').hidden)validateCandidates();};
function finishImport(){week=monday();let cs=activeCourses(state,week);if(!cs.length&&state.courses.length){week=addDays(state.termStart,7*(Math.min(...state.courses.map(c=>c.weekStart||1))-1));cs=activeCourses(state,week);}if(cs.length&&!cs.some(c=>c.day===selectedDay))selectedDay=cs[0].day;view='grid';render();$('import-dialog').close();$('result-note').hidden=false;$('result-note').textContent=`已导入 ${state.courses.length} 条课程。点击课程即可标记“复习过”。${state.scope==='week'?'下周单独记录。':'同名课程按学期累计。'}`;$('table-title').focus();$('result-note').scrollIntoView({block:'center'});}
$('manual-import').onclick=()=>{if(busy)return;candidateMode=$('recognition-mode').value;if(!candidates.length)candidates.push({id:uid(),name:'',location:'',day:selectedDay,start:1,end:1});$('review-section').hidden=false;$('confirm-import').hidden=false;$('ocr-status').textContent='填写课程名称后即可导入，图片会保留供你参考。';review();$('review-courses').querySelector('input')?.focus();};
function review(){ if(candidateMode==='names'){$('review-courses').innerHTML=candidates.map((c,i)=>`<div class="name-review-row"><span>${i+1}</span><input data-index="${i}" data-field="name" value="${esc(c.name)}" aria-label="课程名称" maxlength="80"><button data-remove="${i}" aria-label="移除此课程">×</button></div>`).join('');validateCandidates();return;} $('review-courses').innerHTML=candidates.map((c,i)=>`<section class="review-course"><div class="review-row"><input data-index="${i}" data-field="name" value="${esc(c.name)}" aria-label="课程名称" maxlength="80"><select data-index="${i}" data-field="day" aria-label="星期">${DAYS.map((d,j)=>`<option value="${j}" ${j===c.day?'selected':''}>${d}</option>`).join('')}</select><input type="number" min="1" max="14" data-index="${i}" data-field="start" value="${c.start}" aria-label="开始节次"><input type="number" min="1" max="14" data-index="${i}" data-field="end" value="${c.end}" aria-label="结束节次"><button data-remove="${i}" aria-label="移除此课程">×</button></div><label>教室 / 备注<input data-index="${i}" data-field="location" value="${esc(c.location)}" aria-label="教室或备注" maxlength="160"></label><div class="form-row"><label>起始教学周<input type="number" min="1" max="60" data-index="${i}" data-field="weekStart" value="${c.weekStart??''}" placeholder="不限"></label><label>结束教学周<input type="number" min="1" max="60" data-index="${i}" data-field="weekEnd" value="${c.weekEnd??''}" placeholder="不限"></label></div></section>`).join('');validateCandidates();}
$('review-courses').oninput=e=>{const {index,field}=e.target.dataset;if(field){if(['weekStart','weekEnd'].includes(field)&&!e.target.value)delete candidates[+index][field];else candidates[+index][field]=['name','location'].includes(field)?e.target.value:+e.target.value;validateCandidates();}};$('review-courses').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){candidates.splice(+b.dataset.remove,1);review();}};$('review-add').onclick=()=>{candidates.push({id:uid(),name:'',location:'',day:0,start:1,end:2});review();};
$('recognize').onclick=async()=>{
 if(!fileUrl||busy)return;
 const run={controller:new AbortController(),worker:null};ocrRun=run;
 const current=()=>ocrRun===run&&!run.controller.signal.aborted;
 const wait=promise=>new Promise((resolve,reject)=>{
  const signal=run.controller.signal,abort=()=>reject(new DOMException('已取消识别','AbortError'));
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
 busy=true;$('manual-import').disabled=true;$('import-feedback').hidden=true;candidates=[];$('review-section').hidden=true;$('confirm-import').hidden=true;
 candidateMode=$('recognition-mode').value;$('recognition-mode').disabled=true;
 $('recognize').disabled=true;$('image-input').disabled=true;$('ocr-progress').hidden=false;$('ocr-progress').value=0;
 let worker,gridMode=false;
 try{
  if(!window.Tesseract)throw new Error('识别组件未加载，请刷新页面重试');
  const source=new Image();source.src=fileUrl;await wait(source.decode());
  const scale=Math.min(1,2400/Math.max(source.width,source.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  $('ocr-status').textContent='正在加载中文识别模型，首次使用可能需要一分钟…';
  worker=await wait(Tesseract.createWorker('chi_sim+eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',logger:m=>{
   if(current()&&!gridMode&&m.status==='recognizing text'){$('ocr-status').textContent=`正在识别课程文字… ${Math.round(m.progress*100)}%`;$('ocr-progress').value=m.progress;}
  }}).then(async created=>{if(!current()){await created.terminate();throw new DOMException('已取消识别','AbortError');}run.worker=created;return created;}));
  if(candidateMode==='names'){
   gridMode=true;const result=await wait(recognizeNames(worker,canvas,(message,progress)=>{if(current()){$('ocr-status').textContent=message;$('ocr-progress').value=progress;}}));
   candidates=result.courses;$('ocr-unparsed').textContent=result.warning||'';$('ocr-unparsed').hidden=!result.warning;
  }else{
  const grid=detectGrid(canvas);gridMode=!!grid;
  if(grid){
   const result=await wait(recognizeGridLines(worker,canvas,grid,(done,total)=>{if(current()){$('ocr-status').textContent=`逐格识别课程… ${done}/${total}`;$('ocr-progress').value=done/total;}}));
   candidates=result.courses;$('day-count').value=grid.columns;
   const unmatched=result.raw.filter(r=>!parseCellText(r.text,r.cell.day).length);
   $('ocr-unparsed').textContent=unmatched.length?`有 ${unmatched.length} 个文字区域未能自动解析，请参考原图补充。\n`+unmatched.map(r=>DAYS[r.cell.day]+'：'+r.text).join('\n\n'):'';$('ocr-unparsed').hidden=!unmatched.length;
  }
  if(!grid||!candidates.length){
   gridMode=false;await wait(worker.reinitialize('chi_sim+eng'));await wait(worker.setParameters({tessedit_pageseg_mode:'11'}));
   const {data}=await wait(worker.recognize(canvas));candidates=parseWords(data.words||[],canvas.width,canvas.height,+$('day-count').value,+$('period-count').value);
  }
  }
  $('ocr-status').textContent=candidates.length?`识别到 ${candidates.length} 个课程候选，请逐项校对后导入。`:'未识别到课程。可以尝试更清晰的截图，或手动补充课程。';
  $('review-section').hidden=false;$('confirm-import').hidden=false;review();
 }catch(err){if(current()){$('ocr-status').textContent='识别未完成。图片已保留。';importError(err.name==='EncodingError'?'这张图片无法打开。请重新保存为 PNG 或 JPG 后上传，也可以直接手动填写课程。':'未能加载或完成文字识别。请检查网络后点击“开始识别”重试，也可以直接点击“手动填写课程”。');}}
 finally{
  if(worker)await worker.terminate().catch(()=>{});
  if(current()){ocrRun=null;busy=false;$('manual-import').disabled=false;$('recognize').disabled=!fileUrl;$('image-input').disabled=false;$('recognition-mode').disabled=false;$('ocr-progress').hidden=true;}
 }
};
$('confirm-import').onclick=()=>{if(!validateCandidates())return;const next={...state,namesOnly:candidateMode==='names',courses:structuredClone(candidates),periods:Math.max(candidateMode==='names'?1:+$('period-count').value,...candidates.map(c=>c.end)),progress:{},demo:false};if(candidateMode==='full'&&$('import-term').value)next.termStart=monday(new Date($('import-term').value+'T12:00:00'));try{next.courses.forEach(c=>c.name=c.name.trim());validateState(next);}catch{importError('请核对课程名称、星期及起止位置，范围为 1–14，结束不能早于开始。');return;}if(!state.demo&&state.courses.length&&!confirm('确认替换当前课表？当前课表和进度将被替换，建议先导出备份。'))return;mutate(()=>state=next,'课表已导入，可以开始记录学习');finishImport();};

const doubaoLink=document.createElement('a');doubaoLink.href='./doubao.html';doubaoLink.className='secondary';doubaoLink.textContent='豆包高准确识别';doubaoLink.setAttribute('aria-label','打开豆包高准确课程表识别');$('manual-import').before(doubaoLink);
render();
