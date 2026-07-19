
(function(){
"use strict";

function safeGet(k,d){try{var v=localStorage.getItem(k);return v!=null?v:d}catch(e){return d}}
function safeSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function getVisionKey(){return safeGet("vk","").trim()}
function getChatKey(){return safeGet("ck","").trim()}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

function showToast(msg){
  var t=document.createElement("div");t.textContent=msg;
  t.style.cssText="position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1a2538;color:#6ee7ff;padding:10px 24px;border-radius:24px;font-size:0.85rem;z-index:99999;border:1px solid rgba(110,231,255,0.3);pointer-events:none;";
  document.body.appendChild(t);
  setTimeout(function(){t.style.opacity="0";t.style.transition="opacity 0.3s";setTimeout(function(){t.remove()},300)},2000);
}

// ===== 图片压缩 =====
function compressImage(file){
  return new Promise(function(resolve,reject){
    var img=new Image(),url=URL.createObjectURL(file);
    img.onload=function(){
      URL.revokeObjectURL(url);
      var w=img.width,h=img.height,max=1024;
      if(w>max||h>max){var r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r)}
      var c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg",0.7));
    };
    img.onerror=function(){URL.revokeObjectURL(url);reject(new Error("图片加载失败"))};
    img.src=url;
  });
}

// ===== AI 调用 =====
var QWEN_URL="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
var DEEPSEEK_URL="https://api.deepseek.com/v1/chat/completions";

async function streamChat(url,apiKey,model,messages,onDelta){
  var resp=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},body:JSON.stringify({model:model,messages:messages,temperature:0.7,max_tokens:2048,stream:true})});
  if(!resp.ok){var t=await resp.text(),m="HTTP "+resp.status;try{m=JSON.parse(t).error.message||m}catch(e){}throw new Error(m)}
  var reader=resp.body.getReader(),decoder=new TextDecoder(),buf="",full="";
  while(true){
    var x=await reader.read();if(x.done)break;
    buf+=decoder.decode(x.value,{stream:true});
    var lines=buf.split("\n");buf=lines.pop()||"";
    for(var i=0;i<lines.length;i++){
      var l=lines[i];if(l.indexOf("data: ")!==0)continue;
      var j=l.slice(6).trim();if(j==="[DONE]")return full;
      try{var d=JSON.parse(j),delta=d.choices[0].delta.content;if(delta){full+=delta;onDelta(delta)}}catch(e){}
    }
  }
  return full;
}

function localReply(t){
  if(/(刷单|垫付)/.test(t))return "【反诈提示】刷单返利是诈骗！所有要求垫付资金的刷单都是骗局。请立即停止操作并拨打110报警。";
  if(/安全账户/.test(t))return "【反诈提示】冒充公检法诈骗！公检法机关没有所谓"安全账户"，绝不会电话办案要求转账。请立即挂断并拨打110核实。";
  return "【反诈提示】不轻信、不透露、不转账。如遇可疑情况，请拨打96110反诈专线咨询。如遇紧急情况请直接拨打110。";
}

// ===== 知识库 =====
var hotNews=[
  {title:"最高法发布电信网络诈骗典型案例",content:"最高人民法院发布8件典型案例，涵盖跨境电诈、刷单返利、虚假投资理财、AI换脸诈骗等。来源：最高法官网。"},
  {title:"公安部夏季行动破获跨境电诈案",content:"打掉犯罪团伙1200余个，抓获2.3万名嫌疑人。诈骗分子使用AI语音机器人自动拨打电话。"},
  {title:"AI深度合成技术诈骗引发关注",content:"福建某公司财务被AI换脸假老板骗走186万元。提醒：视频通话不可轻信，转账前务必电话确认。"},
  {title:"共享屏幕诈骗成主流手法",content:"占全部电信诈骗案件23%。骗子冒充客服诱导开启屏幕共享，窃取密码验证码远程转走资金。"}
];
var lawArticles=[
  {title:"总则",content:"预防、遏制和惩治电信网络诈骗活动。以人民为中心，源头治理、综合治理。"},
  {title:"电信治理",content:"电话用户实名制。封堵改号电话。禁止非法制造虚拟拨号设备。"},
  {title:"金融治理",content:"银行建立客户尽职调查制度。监测异常账户，建立涉案资金紧急止付制度。"},
  {title:"互联网治理",content:"网络服务实名制。APP需备案。互联网服务提供者应监测涉诈活动。"}
];
var tips=[
  {title:"刷单返利诈骗特征",content:"前期小额返现获取信任，诱导大额垫付后以操作失误为由拒绝提现。所有刷单都是诈骗。"},
  {title:"安全账户骗局",content:"自称公检法说你涉嫌犯罪，要求转账到安全账户的都是诈骗。公检法没有安全账户。"},
  {title:"警惕共享屏幕诈骗",content:"骗子诱导下载会议软件开启屏幕共享窃取密码。切勿与陌生人共享屏幕。"},
  {title:"验证码=密码",content:"任何索取短信验证码的行为都是诈骗。银行不会电话索要验证码。"}
];
var kb={hot:hotNews,law:lawArticles,tips:tips};
function renderKB(filter){
  filter=filter||"";
  ["hot","law","tips"].forEach(function(cat){
    var c=document.getElementById("cat-"+cat);if(!c)return;
    var data=kb[cat].filter(function(x){return!filter||x.title.indexOf(filter)>=0||x.content.indexOf(filter)>=0});
    c.innerHTML=data.map(function(x){return'<div class="kb-item"><div class="kb-question">'+esc(x.title)+'</div><div class="kb-answer">'+esc(x.content).replace(/\n/g,"<br>")+'</div></div>'}).join("");
    c.querySelectorAll(".kb-item").forEach(function(el){el.onclick=function(e){e.stopPropagation();el.classList.toggle("open")}});
  });
}

// ===== 场景模拟 =====
var scenes=[
  {text:"你收到兼职短信，称刷单返利，一单返30元，让你先垫付500元。你应该？",opts:["先垫付试试","拒绝并举报","询问更多细节"],ans:1,explain:"刷单返利都是诈骗，垫付无法追回。"},
  {text:"自称公安局民警，说你涉嫌洗钱，需要将资金转入安全账户。正确做法？",opts:["配合转账","挂断并报警","提供验证码"],ans:1,explain:"公检法没有安全账户。"},
  {text:"游戏好友高价收购你的账号，需去陌生网站交易并交保证金。你该？",opts:["交易并缴纳保证金","拒绝私下交易","提供账号密码"],ans:1,explain:"应走官方平台交易。"},
  {text:"网友推荐投资虚拟币，称稳赚不赔每天收益10%。",opts:["立即投资","这是虚假投资诈骗","先小额试试"],ans:1,explain:"超高收益必为诈骗。"}
];
var sceneMode="random",levelIdx=0,pts=0;
try{pts=parseInt(safeGet("pts","0"))||0}catch(e){}
function addPts(n){pts+=n;safeSet("pts",String(pts));updatePts()}
function resetPts(){pts=0;safeSet("pts","0");updatePts()}
function updatePts(){var a=document.getElementById("totalPoints"),b=document.getElementById("sceneScore");if(a)a.innerText=pts;if(b)b.innerHTML="&#x2B50; 积分: "+pts}
function renderScene(){
  var c=document.getElementById("sceneQuizArea");if(!c)return;
  var q=sceneMode==="random"?scenes[Math.floor(Math.random()*scenes.length)]:(levelIdx>=scenes.length?(levelIdx=0,addPts(50),c.innerHTML='<div class="scenario-quiz">&#x1F389; 闯关成功！+50积分</div>',void 0):scenes[levelIdx]);
  if(!q)return;
  c.innerHTML='<div class="scenario-quiz"><div class="scenario-text">'+(sceneMode==="level"?"【第"+(levelIdx+1)+"关】":"")+esc(q.text)+'</div><div class="options">'+q.opts.map(function(o,i){return'<div class="opt-item" data-opt="'+i+'">'+esc(o)+'</div>'}).join("")+'</div><div id="sceneFeedback"></div></div>';
  c.querySelectorAll(".opt-item").forEach(function(el){el.onclick=function(){
    var ch=parseInt(el.dataset.opt);if(ch===q.ans){addPts(sceneMode==="random"?10:15);document.getElementById("sceneFeedback").innerHTML='<div style="color:#7cf29a">&#x2705; 正确！+'+(sceneMode==="random"?10:15)+'积分<br>'+q.explain+'</div>';if(sceneMode==="level"){levelIdx++}setTimeout(renderScene,2000)}else{document.getElementById("sceneFeedback").innerHTML='<div style="color:#ff9f9f">&#x274C; 回答错误，请重试</div>'}
  }});
}

// ===== 研判举报 =====
var reports=[];try{reports=JSON.parse(safeGet("reports","[]"))||[]}catch(e){}
function updateReports(){
  var d=document.getElementById("reportList"),a=document.getElementById("reportListArea");if(!d)return;
  if(!reports.length){d.innerHTML="暂无举报记录";if(a)a.style.display="none";return}
  if(a)a.style.display="block";d.innerHTML=reports.map(function(r){return'<div class="report-item">'+esc(r.url||"无")+'<br>'+esc((r.text||"").substring(0,50))+'<br>风险:'+r.risk+'</div>'}).join("");
}
function judgeRisk(){
  var url=(document.getElementById("judgeUrl").value||"").trim(),text=(document.getElementById("judgeText").value||"").trim();
  var score=0,signs=[];
  ["安全账户","刷单","垫付","保证金","屏幕共享","验证码","洗钱","通缉令","取消会员","影响征信"].forEach(function(k){if(text.indexOf(k)>=0){score+=25;signs.push("话术敏感词: "+k)}});
  if(url){if(/(http|https)/.test(url))score+=15;if(/\d+\.\d+\.\d+\.\d+/.test(url)||/\.xyz|\.top/.test(url))score+=25;if(/安全|bank/.test(url.toLowerCase()))score+=20}
  if(/转账|汇款/.test(text))score+=15;
  var level=score>=60?"高":(score>=30?"中":"低");
  var rl=document.getElementById("riskLabel");rl.innerText="风险等级: "+level;rl.className="risk-badge "+(level==="高"?"high":(level==="中"?"mid":"low"));
  document.getElementById("signalsList").innerHTML=signs.length?signs.map(function(s){return'<div class="signal-item">'+s+'</div>'}).join(""):'<div class="signal-item">&#x2705; 未发现明显风险信号</div>';
  var adv=level==="高"?"&#x1F6A8; 极高风险！立即停止操作，切勿转账或提供任何信息。":(level==="中"?"&#x26A0;&#xFE0F; 存在可疑特征，建议通过官方渠道核实，切勿轻易转账。":"&#x1F50D; 暂未发现明显异常，仍需保持警惕，不轻信不转账。");
  document.getElementById("adviceText").innerHTML=adv;
  document.getElementById("judgeResultArea").style.display="block";
  var rb=document.getElementById("jumpReportBtn");
  if(level==="高"){rb.style.display="inline-flex";var nb=rb.cloneNode(true);rb.parentNode.replaceChild(nb,rb);nb.onclick=function(){if(confirm("检测到高风险，是否前往官方平台举报？"))window.open("https://cyberpolice.mps.gov.cn","_blank")}}else rb.style.display="none";
  if(url||text){reports.unshift({url:url,text:text,risk:level,time:new Date().toLocaleString()});if(reports.length>10)reports.pop();safeSet("reports",JSON.stringify(reports));updateReports()}
}

// ===== 闯关游戏 =====
var quiz=[{q:"以下哪种行为容易陷入杀猪盘？",o:["网恋对象推荐投资平台","朋友推荐正规理财","银行客服致电"],ans:0,pts:10},{q:"接到00开头境外电话称你中奖，正确做法？",o:["按提示领奖","直接挂断并拉黑","提供身份证"],ans:1,pts:10},{q:"贷款诈骗常见话术？",o:["无抵押低息但要交保证金","银行正规下款","需要面审"],ans:0,pts:10}];
var gameMode="free";
function renderGame(){
  var a=document.getElementById("gameArea");if(!a)return;
  if(gameMode==="free"){a.innerHTML='<div style="display:flex;flex-direction:column;gap:10px">'+quiz.map(function(q,i){return'<div style="background:rgba(255,255,255,0.05);border-radius:20px;padding:14px"><div style="font-weight:600;margin-bottom:8px">'+esc(q.q)+'</div><button class="btn-sm" data-gidx="'+i+'">开始挑战 +'+q.pts+'分</button></div>'}).join("")+'</div>';a.querySelectorAll("[data-gidx]").forEach(function(b){b.onclick=function(){startGame(quiz[parseInt(b.dataset.gidx)])}})}
  else startGame(quiz[Math.floor(Math.random()*quiz.length)]);
}
function startGame(q){
  var a=document.getElementById("gameArea");a.innerHTML='<div class="scenario-quiz"><div class="scenario-text">'+esc(q.q)+'</div><div class="options">'+q.o.map(function(o,i){return'<div class="opt-item" data-opt="'+i+'">'+esc(o)+'</div>'}).join("")+'</div><div id="gameFeedback"></div></div>';
  a.querySelectorAll(".opt-item").forEach(function(el){el.onclick=function(){var ch=parseInt(el.dataset.opt);if(ch===q.ans){addPts(q.pts);document.getElementById("gameFeedback").innerHTML='<div style="color:#7cf29a">&#x2705; 正确！+'+q.pts+'积分</div>';setTimeout(renderGame,1500)}else document.getElementById("gameFeedback").innerHTML='<div style="color:#ff9f9f">&#x274C; 错误，正确答案：'+q.o[q.ans]+'</div>'}});
}

// ===== 面板切换 =====
var panelMap={chat:"chatPanel",scene:"scenePanel",judge:"judgePanel",kb:"kbPanel",game:"gamePanel"};
function switchTab(tab){
  Object.keys(panelMap).forEach(function(k){var p=document.getElementById(panelMap[k]);if(p)p.classList.remove("active")});
  var tp=document.getElementById(panelMap[tab]);if(tp)tp.classList.add("active");
  document.querySelectorAll(".func-btn").forEach(function(b){b.classList.toggle("active",b.dataset.tab===tab)});
  if(tab==="scene")renderScene();if(tab==="game")renderGame();
  if(tab==="kb")renderKB((document.getElementById("kbSearch")||{}).value||"");
  if(tab==="judge"){document.getElementById("judgeResultArea").style.display="none"}
}

// ===== 主初始化 =====
document.addEventListener("DOMContentLoaded",function(){
  var files=[],chatMsgs=document.getElementById("chatMessages"),chatInput=document.getElementById("chatInput");
  var sendBtn=document.getElementById("sendBtn"),attachBtn=document.getElementById("attachBtn");
  var fileUp=document.getElementById("fileUpload"),preview=document.getElementById("filePreviewArea"),voiceBtn=document.getElementById("voiceBtn");

  function appendMsg(role,text){
    var d=document.createElement("div");d.className="message "+role;
    d.innerHTML='<div class="msg-avatar">'+(role==="ai"?"AI":"&#x6211;")+'</div><div class="msg-bubble">'+esc(text).replace(/\n/g,"<br>")+'</div>';
    chatMsgs.appendChild(d);chatMsgs.scrollTop=chatMsgs.scrollHeight;
  }
  function appendThinking(){
    var d=document.createElement("div");d.className="message ai";d.id="thinkMsg";
    d.innerHTML='<div class="msg-avatar">AI</div><div class="msg-bubble">&#x1F914; 分析中...</div>';
    chatMsgs.appendChild(d);chatMsgs.scrollTop=chatMsgs.scrollHeight;return d;
  }

  async function sendMsg(){
    var text=chatInput.value.trim();if(!text&&!files.length)return;
    var imgs=files.filter(function(f){return f.type.indexOf("image/")===0}),hasImg=imgs.length>0;
    if(hasImg&&!getVisionKey()){showToast("请先配置图片识别 Key（点击右上角齿轮）");return}
    if(!hasImg&&!getChatKey()){showToast("请先配置文字对话 Key（点击右上角齿轮）");return}
    appendMsg("user",text||(hasImg?"发送了 "+imgs.length+" 张图片":""));
    chatInput.value="";preview.innerHTML="";files=[];

    var thinking=appendThinking();
    try{
      var content=text;
      if(hasImg){
        var parts=[];for(var i=0;i<imgs.length;i++){var b64=await compressImage(imgs[i]);parts.push({type:"image_url",image_url:{url:b64}})}if(text)parts.push({type:"text",text:text});content=parts;
      }
      var sys=hasImg?"你是谛听——AI反诈守护伙伴。分析图片中的诈骗元素（截图、聊天记录、二维码、证件、APP界面、转账记录），简洁描述内容并指出可疑之处，给出行动建议。语气亲切坚定。":"你是谛听——AI反诈守护伙伴。你24小时陪伴用户，语气亲切温暖。核心能力：诈骗识别、风险研判、劝阻建议、知识科普。涉及转账/验证码/陌生链接要警觉。已转账的优先建议打110和银行客服。";
      var msgs=[{role:"system",content:sys},{role:"user",content:content}];
      var url=hasImg?QWEN_URL:DEEPSEEK_URL,key=hasImg?getVisionKey():getChatKey(),model=hasImg?"qwen-vl-plus":"deepseek-chat";
      thinking.remove();
      var el=document.createElement("div");el.className="message ai";el.innerHTML='<div class="msg-avatar">AI</div><div class="msg-bubble"></div>';
      chatMsgs.appendChild(el);var bubble=el.querySelector(".msg-bubble"),streamed="";
      var full=await streamChat(url,key,model,msgs,function(chunk){streamed+=chunk;bubble.textContent=streamed;chatMsgs.scrollTop=chatMsgs.scrollHeight});
      if(!full&&!streamed)bubble.textContent="AI 未返回有效回复，请重试。";
    }catch(e){
      thinking.remove();var err=String(e.message||e);
      appendMsg("ai",localReply(text)+"\n\n&#x1F6AB; 错误："+err);
    }
  }

  attachBtn.onclick=function(){fileUp.click()};
  fileUp.onchange=function(e){files=Array.from(e.target.files);preview.innerHTML=files.map(function(f){return'<span style="background:#2e3a48;padding:4px 12px;border-radius:16px;font-size:0.75rem">&#x1F4CE; '+esc(f.name)+'</span>'}).join("");e.target.value=""};
  sendBtn.onclick=sendMsg;
  chatInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();sendMsg()}});

  // 语音
  var rec=null,listening=false;
  try{var SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(SR){rec=new SR();rec.lang="zh-CN";rec.interimResults=true;rec.continuous=true;var ft="";rec.onstart=function(){voiceBtn.classList.add("voice-active");ft=""};rec.onend=function(){voiceBtn.classList.remove("voice-active");listening=false;if(ft)chatInput.value=ft};rec.onerror=function(){voiceBtn.classList.remove("voice-active");listening=false};rec.onresult=function(e){for(var i=e.resultIndex;i<e.results.length;i++){var t=e.results[i][0].transcript;if(e.results[i].isFinal)ft+=t;chatInput.value=ft+(e.results[i].isFinal?"":t)}}}}catch(e){}
  voiceBtn.onclick=function(){if(!rec){showToast("浏览器不支持语音输入，请使用 Chrome");return}if(listening){rec.stop()}else{rec.start();listening=true}};

  // 配置面板
  var overlay=document.getElementById("configOverlay");
  document.getElementById("headerSettingsBtn").onclick=function(){document.getElementById("cfgVisionKey").value=getVisionKey();document.getElementById("cfgChatKey").value=getChatKey();overlay.classList.add("show")};
  document.getElementById("saveConfigBtn").onclick=function(){var v=document.getElementById("cfgVisionKey").value.trim(),c=document.getElementById("cfgChatKey").value.trim();safeSet("vk",v);safeSet("ck",c);overlay.classList.remove("show");showToast(v&&c?"双 Key 已保存":v?"图片 Key 已保存":c?"对话 Key 已保存":"未填写 Key")};
  document.getElementById("cancelConfigBtn").onclick=function(){overlay.classList.remove("show")};
  overlay.addEventListener("click",function(e){if(e.target===overlay)overlay.classList.remove("show")});

  // 场景
  document.getElementById("randomModeBtn").addEventListener("click",function(){sceneMode="random";document.getElementById("randomModeBtn").classList.add("active-mode");document.getElementById("levelModeBtn").classList.remove("active-mode");levelIdx=0;renderScene()});
  document.getElementById("levelModeBtn").addEventListener("click",function(){sceneMode="level";document.getElementById("levelModeBtn").classList.add("active-mode");document.getElementById("randomModeBtn").classList.remove("active-mode");levelIdx=0;renderScene()});
  document.getElementById("resetScenePoints").addEventListener("click",resetPts);
  document.getElementById("resetGamePoints").addEventListener("click",resetPts);

  // 研判
  document.getElementById("doJudgeBtn").addEventListener("click",judgeRisk);
  document.getElementById("simulateHighRiskBtn").addEventListener("click",function(){document.getElementById("judgeUrl").value="http://www.fake-bank.xyz/sec";document.getElementById("judgeText").value="你好，我是银联客服，您的账户异常，需要转至安全账户验证。";judgeRisk()});
  document.getElementById("clearReportsBtn").addEventListener("click",function(){if(confirm("确定清空？")){reports=[];safeSet("reports","[]");updateReports()}});updateReports();

  // 课堂
  renderKB("");document.getElementById("kbSearch").addEventListener("input",function(){renderKB(this.value)});
  document.querySelectorAll(".kb-tab-btn").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".kb-category").forEach(function(c){c.classList.remove("active-category")});document.querySelectorAll(".kb-tab-btn").forEach(function(x){x.classList.remove("active")});b.classList.add("active");document.getElementById("cat-"+b.dataset.cat).classList.add("active-category")})});

  // 闯关
  document.getElementById("randomModeGameBtn").addEventListener("click",function(){gameMode="random";document.getElementById("randomModeGameBtn").classList.add("active-mode");document.getElementById("freeModeGameBtn").classList.remove("active-mode");renderGame()});
  document.getElementById("freeModeGameBtn").addEventListener("click",function(){gameMode="free";document.getElementById("freeModeGameBtn").classList.add("active-mode");document.getElementById("randomModeGameBtn").classList.remove("active-mode");renderGame()});

  // 面板切换
  document.querySelectorAll(".func-btn").forEach(function(b){b.addEventListener("click",function(){switchTab(b.dataset.tab)})});
  ["Scene","Judge","Kb","Game"].forEach(function(n){document.getElementById("backHomeFrom"+n).addEventListener("click",function(){switchTab("chat")})});

  updatePts();renderScene();
});
})();
