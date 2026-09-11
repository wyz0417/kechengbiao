// Reviewed character confusions from public development samples, independent of image/position.
const spellingCorrections={'语葡':'语文','语雯':'语文','语坟':'语文','损蛋':'掼蛋','程序设计(<语言)':'程序设计(C语言)'};
const commonNames=['高等数学','线性代数','大学英语','大学物理','形势与政策','程序设计(C语言)','思想道德与法治'];
function oneEdit(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,n=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return n+(a.length-i)+(b.length-j)===1;}
export function mainCourseName(value){
 let name=String(value).normalize('NFKC').replace(/\s+/g,'').replace(/^[^\p{L}\p{N}]+/u,'').replace(/[|丨]+$/,'');
 name=name.replace(/^.{1,3}?(?=(?:高等数学|大学|工程力学|程序设计|思想道德|国家安全|无人机|二级Office|形势与政策|体育|人工智能|数据采集|数据库|图形图像|Python|Hadoop))/,'');
 name=name.replace(/\[(?:[^\]]*(?:类|分组|周)[^\]]*)\]/g,'').replace(/\((?:上|下|[\dIVX一二三四五六]+|全新版)\)/gi,'');
 name=name.replace(/(?:[-—]\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVXl|]+|[A-C](?:\d+)?|\d+)$/g,'');
 name=name.replace(/(?:\[?科学精神类\]?)$/,'').replace(/[·,，:：;；-]+$/,'').slice(0,80);
 if(spellingCorrections[name])return spellingCorrections[name];
 const corrections=name.length>=5?commonNames.filter(known=>oneEdit(name,known)):[];
 return corrections.length===1?corrections[0]:name;
}
const subjects=new Set('语文 数学 英语 物理 化学 生物 历史 地理 政治 音乐 美术 体育 科学 劳动 写字 计算机 设计 掼蛋 跳绳 游泳 舞蹈 阅读 编程 班会 道法 信息技术 心理 社团'.split(' '));
export function isCourseNoise(text){return /^(?:星期|礼拜|周)[一二三四五六日天1-7]/.test(text)||/^(?:上午|下午|晚上|中午|早上|时段|节次|时间|课程表|第[一二三四五六七八九十\d]+[大节课]|无课|一无课一|今天|午餐|午饭|午休|眼操|眼保健操|大课间|课间|作业[、,]|周次待定|升旗)/.test(text)||!/[\p{Script=Han}A-Za-z]{2}/u.test(text);}
export function isCourseMetadata(text){
 return /校区|教室|教学楼|实训[室楼]|机房|操场|课程代码|任课|教师|老师|授课|学分|教学班/.test(text)||/实验室$|计算机中心$/.test(text)||/\d.*(?:周|节)|\d[:：]\d|\d{3,}|^[()\d\-~、,，]+$/.test(text)||/^[(（](?:分组|篮球|足球)/.test(text)||/^[\p{Script=Han}A-Za-z]{2,6}(?:\([A-Z]\))?[·.。:：\-“"](?=[\p{Script=Han}A-Za-z])/u.test(text)||/^[\p{Script=Han}]{2,3}[,，、][\p{Script=Han}]{2,3}$/u.test(text);
}
export function extractCourseNames(input){
 const lines=input.map(v=>typeof v==='string'?{text:v}:v);const names=[];let current='',lastBottom=null,afterMetadata=false,titleHeight=0,metadataHeight=0,lastSeenBottom=null;
 const flush=()=>{const name=mainCourseName(current),han=(name.match(/\p{Script=Han}/gu)||[]).length;if(name&&(han>=2||/^[A-Za-z][A-Za-z+ .-]{2,}$/.test(name))&&!isCourseNoise(name)&&!isCourseMetadata(current))names.push(name);current='';};
 for(const line of lines){
  const text=line.text.normalize('NFKC').replace(/\s+/g,'').replace(/^[^\p{Script=Han}A-Za-z0-9(]+/u,'');
  const gapFromPrevious=lastSeenBottom!=null&&line.top!=null?line.top-lastSeenBottom:0;lastSeenBottom=line.bottom??lastSeenBottom;
  if(!text)continue;
  if(current&&line.height&&titleHeight&&line.height<titleHeight*.85){flush();afterMetadata=true;metadataHeight=line.height;continue;}
  const likelyTitle=subjects.has(mainCourseName(text))||text.length>=4&&/大学|高等|工程|程序|思想|国家|无人机|体育|形势|Office|Python|Hadoop|数据库|图形|数据采集|技术|应用|课程|基础|教育|概论|导论/.test(text);
  if(afterMetadata&&!likelyTitle&&gapFromPrevious<(line.height||16)*1.7&&(!line.height||!metadataHeight||line.height<=metadataHeight*1.2))continue;
  if(isCourseNoise(text)||isCourseMetadata(text)||/^\d+[^A-Za-z\d]/.test(text)){flush();afterMetadata=true;metadataHeight=line.height||metadataHeight;continue;}
  if(/^(?:[A-CIVXl|]+(?:\(\d+\))?|\(\d+\)|\d+)$/.test(text)){if(current)current+=text;continue;}
  // Short personal names after a university title are metadata; keep ordinary short school subjects.
  if(text.length<=3&&!subjects.has(text)&&!/[A-Za-z]/.test(text)){
   if(current&&current.length>3&&line.height&&titleHeight&&line.height>=titleHeight*.9){current+=text;continue;}
   if(current&&(text.length===1||/(?:体系概论|变换)$/.test(current+text))){current+=text;continue;}
   if(current||afterMetadata){flush();afterMetadata=true;continue;}
  }
  const gap=lastBottom!=null&&line.top!=null?line.top-lastBottom:0;
  if(current&&(gap>Math.max(10,(line.height||16)*1.2)||subjects.has(text)&&subjects.has(current)))flush();
  if(!current)titleHeight=line.height||0;current+=text;lastBottom=line.bottom??null;afterMetadata=false;
 }
 flush();return names;
}
