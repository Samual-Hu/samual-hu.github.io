import {formatTime,indexAtTime,chapterForMove,curveMoveAtX,scoreLabel} from './player-core.mjs';
const $=id=>document.getElementById(id);
const icons={
play:'<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
pause:'<path d="M8 5v14M16 5v14" stroke-width="3.4"/>',
previous:'<path d="M6 5v14m12-14L8 12l10 7z"/>',
next:'<path d="M18 5v14M6 5l10 7-10 7z"/>',
replay:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
sound:'<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
muted:'<path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6m0-6-6 6"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
for(const [id,name] of [['play','play'],['previous','previous'],['next','next'],['replay','replay'],['sound','sound']])$(id).innerHTML=icon(name);
const audio=$('narration');
audio.preload='auto';
let data,index=0,playing=false,muted=false,speed=1,offset=0,startedAt=0,segmentUsesAudio=false;
let epoch=0,timer=0,raf=0,noticeTimer=0,mode='score',resumeAfterSeek=false,seeking=false;
let selectedTopic=null;
const plot={padding:27,width:1100,top:9,bottom:75,min:0,max:100};
function current(){return data.events[index];}
function say(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').hidden=true;},4200);}
function nowOffset(){
 if(!playing)return offset;
 if(segmentUsesAudio)return Math.min(current().duration,audio.currentTime||offset);
 return Math.min(current().duration,offset+(performance.now()-startedAt)/1000*speed);
}
function updateProgress(){
 if(!data)return;
 const t=Math.min(data.duration,current().start+nowOffset());
 if(!seeking)$('progress').value=String(t);
 $('clock').textContent=formatTime(t)+' / '+formatTime(data.duration);
 $('progress').setAttribute('aria-valuetext',formatTime(t)+'，第'+(current().move||1)+'手');
}
function tick(){updateProgress();if(playing)raf=requestAnimationFrame(tick);}
function updatePlayButton(){
 $('play').innerHTML=icon(playing?'pause':'play');
 $('play').setAttribute('aria-label',playing?'暂停讲解':'播放讲解');
 document.body.classList.toggle('playing',playing);
}
function stop(){
 if(!data)return;
 offset=nowOffset();
 playing=false;epoch++;clearTimeout(timer);cancelAnimationFrame(raf);audio.pause();
 updatePlayButton();updateProgress();
}
function finishSegment(token){
 if(token!==epoch||!playing)return;
 offset=current().duration;
 if(index===data.events.length-1){stop();$('progress').value=String(data.duration);$('clock').textContent=formatTime(data.duration)+' / '+formatTime(data.duration);return;}
 timer=setTimeout(()=>{if(token!==epoch||!playing)return;moveTo(index+1,true);},250/speed);
}
function play(){
 if(!data||playing)return;
 if(index===data.events.length-1&&offset>=current().duration){index=0;offset=0;render();}
 const e=current();
 if(offset>=e.duration)offset=0;
 const token=++epoch;
 playing=true;startedAt=performance.now();segmentUsesAudio=!!e.audio;
 clearTimeout(timer);cancelAnimationFrame(raf);audio.muted=muted;audio.defaultPlaybackRate=speed;audio.playbackRate=speed;
 updatePlayButton();
 if(e.audio){
   if(audio.dataset.event!==e.id){audio.dataset.event=e.id;audio.src=e.audio;audio.load();}
   audio.playbackRate=speed;
   const setOffset=()=>{if(token===epoch){audio.currentTime=Math.min(offset,e.audioDuration||e.duration);audio.playbackRate=speed;}};
   if(audio.readyState>=1)setOffset();else audio.addEventListener('loadedmetadata',setOffset,{once:true});
   audio.onended=()=>finishSegment(token);
   audio.onerror=()=>{
     if(token!==epoch||!playing||audio.error?.code===1)return;
     segmentUsesAudio=false;startedAt=performance.now();offset=0;
     say('这一段配音暂未载入，棋盘会继续播放。可以点击重听再试。');
     timer=setTimeout(()=>finishSegment(token),e.duration/speed*1000);
   };
   audio.play().catch(error=>{
     if(token!==epoch||error.name==='AbortError')return;
     stop();say('点击播放按钮，即可继续收听。');
   });
 }else{
   audio.pause();
   timer=setTimeout(()=>finishSegment(token),Math.max(0,e.duration-offset)/speed*1000);
 }
 tick();
}
function moveTo(next,autoplay=false,at=0){
 stop();index=Math.max(0,Math.min(data.events.length-1,next));offset=Math.max(0,Math.min(current().duration,at));
 render();updateProgress();if(autoplay)play();
}
function jumpMove(move,autoplay=true){
 const n=Math.max(1,Math.min(183,Math.round(move)));
 selectedTopic=n;
 moveTo(chapterForMove(data,n),autoplay);
 history.replaceState(null,'','#move='+n);
}
function jumpTime(time,autoplay){
 selectedTopic=null;
 const n=indexAtTime(data.events,time);moveTo(n,autoplay,time-data.events[n].start);
}
function boardSvg(e){
 const N=19,start=40,gap=30;
 const box=$('board').getBoundingClientRect(),scale=620/Math.max(180,Math.min(box.width,box.height));
 const coordFont=Math.max(12,9*scale),markFont=Math.max(12,8*scale);
 $('board').style.setProperty('--board-coord-size',coordFont+'px');
 let grid='',coords='',stones='',stars='';
 for(let n=0;n<N;n++){
   const p=start+n*gap;
   grid+='<path d="M40 '+p+'H580M'+p+' 40V580"/>';
   const letter='ABCDEFGHJKLMNOPQRST'[n];
   coords+='<text x="'+p+'" y="25">'+letter+'</text><text x="'+p+'" y="604">'+letter+'</text><text x="21" y="'+(p+4)+'">'+(19-n)+'</text><text x="599" y="'+(p+4)+'">'+(19-n)+'</text>';
 }
 for(const row of [3,9,15])for(const col of [3,9,15])stars+='<circle cx="'+(start+col*gap)+'" cy="'+(start+row*gap)+'" r="2.6"/>';
 const marks=new Map((e.marks||[]).map(m=>[m.point.join(','),m]));
 for(let n=0;n<361;n++){
   const color=e.board[n];if(color!== 'b'&&color!=='w')continue;
   const col=n%19,row=Math.floor(n/19),x=start+col*gap,y=start+row*gap;
   stones+='<circle cx="'+x+'" cy="'+(y+1.2)+'" r="13.3" fill="#3b2a15" opacity=".13"/><circle cx="'+x+'" cy="'+y+'" r="13.15" fill="url(#stone-'+color+')" stroke="'+(color==='b'?'#141b1c':'#d2cabc')+'" stroke-width=".6"/>';
   const mark=marks.get(col+','+row);
   if(mark)stones+='<text x="'+x+'" y="'+(y+markFont*.34)+'" fill="'+(color==='b'?'#f7f5e9':'#33413b')+'" font-size="'+markFont+'" text-anchor="middle" font-family="system-ui" font-weight="500">'+mark.number+'</text>';
   else if(e.last&&e.last[0]===col&&e.last[1]===row)stones+='<circle cx="'+x+'" cy="'+y+'" r="5" fill="none" stroke="'+(color==='b'?'#f4f0db':'#335d51')+'" stroke-width="1.5"/>';
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 620" role="img" aria-label="只读棋盘，实战第'+e.displayMove+'手'+(e.branch?'，变化第'+e.step+'手':'')+'" data-segment="'+e.id+'" data-topic="'+e.move+'" data-position="'+e.displayMove+'"><defs><linearGradient id="wood" x2=".9" y2="1"><stop stop-color="#e8c78d"/><stop offset=".5" stop-color="#e6c38b"/><stop offset="1" stop-color="#dbb579"/></linearGradient><radialGradient id="stone-b" cx="32%" cy="24%" r="80%"><stop stop-color="#565e5e"/><stop offset=".45" stop-color="#242d2f"/><stop offset="1" stop-color="#0d1418"/></radialGradient><radialGradient id="stone-w" cx="34%" cy="26%" r="82%"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#faf9f3"/><stop offset="1" stop-color="#dedbd0"/></radialGradient><pattern id="grain" width="43" height="37" patternUnits="userSpaceOnUse"><path d="M2 0q2 11 0 37M12 0q-2 14 1 37M29 0q3 21 0 37M40 0q-3 17 0 37" fill="none" stroke="#735029" stroke-width=".4" opacity=".06"/></pattern></defs><rect x="10" y="11" width="600" height="600" rx="7" fill="#4d3515" opacity=".08"/><rect x="10" y="8" width="600" height="600" rx="7" fill="url(#wood)"/><rect x="10" y="8" width="600" height="600" rx="7" fill="url(#grain)"/><g stroke="#795d35" stroke-width=".8" fill="none" opacity=".85">'+grid+'</g><g fill="#765d37">'+stars+'</g><g fill="#927345" font-size="11" font-family="system-ui" text-anchor="middle">'+coords+'</g>'+stones+'</svg>';
}
function render(){
 const e=current(),side=e.color==='B'?'黑':'白';
 if(selectedTopic&&(e.kind==='review'||e.kind==='finish'||e.kind==='main'&&e.move>selectedTopic))selectedTopic=null;
 $('board').innerHTML=boardSvg(e);
 $('board-move').textContent=e.branch?'以实战 '+e.displayMove+' 手为起点':e.displayMove+' / 183';
 $('board-context').textContent=e.branch?'讲解变化 '+e.branch.slice(1).replace(/^0/,''):e.kind==='review'?'终局回顾':e.kind==='context'?'实战 '+e.displayMove+' · 回看 '+e.move:e.label||'实战';
 const isVariation=!!e.branch;
 $('segment-badge').textContent=isVariation?'变化':e.kind==='review'?'回顾':e.kind==='start'?'准备开始':e.kind==='finish'?'终局':'实战';
 $('segment-badge').classList.toggle('variation',isVariation);
 $('segment-label').textContent=isVariation?side+' '+e.coordinate+' · 变化 '+e.step+' / '+e.branchLength:e.move?'第'+e.move+'手 · '+side+' '+e.coordinate:'按讲解顺序';
 let text=e.text;
 if(!text)text=e.kind==='start'?'从实战到变化，跟着讲解一路看下去。':e.kind==='finish'?'这一盘讲解已结束。':e.kind==='transition'?(e.label||'切换变化'):'这一手没有单独解说。';
 $('comment').textContent=text;
 $('comment').scrollTop=0;
 $('comment').style.color=e.text?'':'#8d958c';
 $('segment-detail').textContent=e.kind==='start'?'点击播放开始；也可以从下方曲线选择一手棋。':isVariation?'对应实战第'+e.move+'手的比较变化。播放结束后会自动继续。':e.kind==='context'?'当前棋盘是第'+e.displayMove+'手，讲解指向第'+e.move+'手。':e.kind==='finish'?'可以点击目差曲线，重新听任意一手。':e.kind==='review'?'按讲解顺序回看这手棋。':'';
 $('previous').disabled=index===0;$('next').disabled=index===data.events.length-1;
 if(selectedTopic&&e.move!==selectedTopic&&e.kind==='main')$('segment-detail').textContent='正在播放第'+selectedTopic+'手的完整讲解，先看相关局面。';
 document.querySelectorAll('#key-moves button').forEach(b=>b.classList.toggle('active',Number(b.dataset.move)===(selectedTopic??e.move)));
 renderChart();updateProgress();
}
function renderKeyMoves(){
 $('key-moves').innerHTML=data.keyMoves.map(m=>'<button type="button" data-move="'+m.move+'" aria-label="播放第'+m.move+'手'+(m.color==='B'?'黑':'白')+m.coordinate+'的讲解"><span class="key-primary"><i class="stone-dot '+(m.color==='B'?'black':'white')+'"></i>'+m.move+' <span>· '+m.coordinate+'</span></span><span class="key-loss">−'+Number(m.pointsLoss).toFixed(1)+'目</span></button>').join('');
 document.querySelectorAll('#key-moves button').forEach(button=>button.addEventListener('click',()=>jumpMove(Number(button.dataset.move))));
}
function pointX(n){return plot.padding+n/183*(plot.width-plot.padding*2);}
function pointY(value){return plot.bottom-(value-plot.min)/(plot.max-plot.min)*(plot.bottom-plot.top);}
function renderChart(){
 if(!data)return;
 const svg=$('chart');plot.width=Math.max(240,svg.clientWidth||1100);
 const values=data.curve.map(p=>mode==='score'?p.black_score_lead_points:p.black_winrate_percent);
 plot.min=mode==='score'?Math.min(-3,Math.floor(Math.min(...values)*1.2)):0;
 plot.max=mode==='score'?Math.max(10,Math.ceil(Math.max(...values)*1.08/10)*10):100;
 const coords=data.curve.map((p,i)=>[pointX(p.move_number),pointY(values[i])]);
 const d=coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' ');
 const zero=pointY(mode==='score'?0:50),n=Math.max(1,current().move||1),active=data.curve[n-1];
 const currentX=pointX(n),currentY=pointY(values[n-1]);
 let markup='<defs><linearGradient id="curve-fill" x2="0" y2="1"><stop stop-color="#2d6662" stop-opacity=".15"/><stop offset="1" stop-color="#2d6662" stop-opacity=".02"/></linearGradient></defs>';
 markup+='<path class="chart-grid" d="M'+plot.padding+' '+zero+'H'+(plot.width-plot.padding)+'"/>';
 markup+='<path d="'+d+'L'+coords.at(-1)[0]+' '+zero+'L'+coords[0][0]+' '+zero+'Z" fill="url(#curve-fill)"/><path class="chart-line" d="'+d+'"/>';
 for(const move of [1,30,60,90,120,150,183])markup+='<text class="chart-axis-label" text-anchor="middle" x="'+pointX(move)+'" y="94">'+move+'</text>';
 const topLabel=mode==='score'?'黑+'+plot.max:'100%',lowLabel=mode==='score'?'0':'50%';
 markup+='<text class="chart-axis-label" x="0" y="12">'+topLabel+'</text><text class="chart-axis-label" x="0" y="'+Math.min(78,zero+3)+'">'+lowLabel+'</text>';
 for(const m of data.keyMoves){
   const p=data.curve[m.move-1],v=mode==='score'?p.black_score_lead_points:p.black_winrate_percent;
   markup+='<circle class="chart-loss" cx="'+pointX(m.move)+'" cy="'+pointY(v)+'" r="3.4" data-move="'+m.move+'"><title>第'+m.move+'手 '+(m.color==='B'?'黑':'白')+m.coordinate+'，损失'+m.pointsLoss+'目</title></circle>';
 }
 markup+='<path class="chart-cursor" d="M'+currentX+' 4V81"/><circle class="chart-current" cx="'+currentX+'" cy="'+currentY+'" r="4.2"/>';
 svg.innerHTML=markup;svg.setAttribute('viewBox','0 0 '+plot.width+' 98');
 svg.setAttribute('aria-valuenow',String(n));svg.setAttribute('aria-valuetext','第'+n+'手，'+(mode==='score'?scoreLabel(active.black_score_lead_points):'黑方胜率'+active.black_winrate_percent.toFixed(1)+'%'));
 $('chart-heading').textContent=mode==='score'?'整局目差':'整局胜率';
 $('evaluation').textContent=current().move?(mode==='score'?scoreLabel(active.black_score_lead_points):'黑方 '+active.black_winrate_percent.toFixed(1)+'%'):'黑方视角';
 $('mode-score').setAttribute('aria-pressed',String(mode==='score'));$('mode-winrate').setAttribute('aria-pressed',String(mode==='winrate'));
}
function chartMove(event){
 const tagged=event.target.closest('[data-move]');
 if(tagged)return Number(tagged.dataset.move);
 const rect=$('chart').getBoundingClientRect();
 return curveMoveAtX(event.clientX-rect.left,rect.width,183,plot.padding);
}
function hoverChart(event){
 const n=chartMove(event),m=data.curve[n-1],ref=data.mainline[n-1],rect=$('chart-wrap').getBoundingClientRect();
 const tooltip=$('chart-tooltip');
 tooltip.textContent='第'+n+'手 · '+(ref.color==='B'?'黑':'白')+' '+ref.coordinate+'\n'+scoreLabel(m.black_score_lead_points)+' · 黑方胜率 '+m.black_winrate_percent.toFixed(1)+'%';
 tooltip.style.whiteSpace='pre-line';tooltip.hidden=false;
 tooltip.style.left=Math.min(rect.width-tooltip.offsetWidth-2,Math.max(0,event.clientX-rect.left-tooltip.offsetWidth/2))+'px';
}
$('play').addEventListener('click',()=>playing?stop():play());
$('previous').addEventListener('click',()=>{selectedTopic=null;moveTo(index-1,playing);});
$('next').addEventListener('click',()=>{selectedTopic=null;moveTo(index+1,playing);});
$('replay').addEventListener('click',()=>moveTo(index,true));
$('sound').addEventListener('click',()=>{
 muted=!muted;audio.muted=muted;$('sound').innerHTML=icon(muted?'muted':'sound');
 $('sound').setAttribute('aria-pressed',String(!muted));$('sound').setAttribute('aria-label',muted?'开启配音':'关闭配音');
});
$('speed').addEventListener('change',()=>{const was=playing;stop();speed=Number($('speed').value);audio.playbackRate=speed;if(was)play();});
$('progress').addEventListener('pointerdown',()=>{resumeAfterSeek=playing;seeking=true;stop();});
$('progress').addEventListener('input',()=>{$('clock').textContent=formatTime($('progress').value)+' / '+formatTime(data.duration);});
$('progress').addEventListener('change',()=>{const resume=seeking?resumeAfterSeek:playing;seeking=false;jumpTime(Number($('progress').value),resume);});
$('chart').addEventListener('click',event=>{if(data)jumpMove(chartMove(event));});
$('chart').addEventListener('pointermove',event=>{if(data)hoverChart(event);});
$('chart').addEventListener('pointerleave',()=>{$('chart-tooltip').hidden=true;});
$('chart').addEventListener('keydown',event=>{
 if(!data)return;let n=current().move||1;
 if(event.key==='ArrowRight')n++;else if(event.key==='ArrowLeft')n--;else if(event.key==='Home')n=1;else if(event.key==='End')n=183;else return;
 event.preventDefault();jumpMove(n,false);
});
$('mode-score').addEventListener('click',()=>{mode='score';renderChart();});
$('mode-winrate').addEventListener('click',()=>{mode='winrate';renderChart();});
$('source-button').addEventListener('click',()=>$('source-dialog').showModal());
$('close-source').addEventListener('click',()=>$('source-dialog').close());
$('source-dialog').addEventListener('click',event=>{if(event.target===$('source-dialog')){const r=$('source-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('source-dialog').close();}});
document.addEventListener('keydown',event=>{
 if(!data||$('source-dialog').open||event.target.closest('input,select,button,a,[role=slider]'))return;
 if(event.code==='Space'){event.preventDefault();playing?stop():play();}
 else if(event.key==='ArrowRight'){event.preventDefault();moveTo(index+1,playing);}
 else if(event.key==='ArrowLeft'){event.preventDefault();moveTo(index-1,playing);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop();});
window.addEventListener('pagehide',()=>audio.pause());
new ResizeObserver(()=>renderChart()).observe($('chart-wrap'));
new ResizeObserver(()=>{if(data)$('board').innerHTML=boardSvg(current());}).observe($('board'));
window.addEventListener('hashchange',()=>{const match=location.hash.match(/move=(\d+)/);if(data&&match){selectedTopic=Number(match[1]);moveTo(chapterForMove(data,selectedTopic),false);}});
try{
 const response=await fetch('data/lecture.json');if(!response.ok)throw new Error('data');
 data=await response.json();
 $('progress').max=String(data.duration);
 $('coverage').textContent=data.moveCount+'手实战、'+data.annotationCount+'段原话、'+data.variationCount+'条已核对变化。'+data.sources.coverage;
 renderKeyMoves();
 const match=location.hash.match(/move=(\d+)/);
 if(match){selectedTopic=Number(match[1]);index=chapterForMove(data,selectedTopic);}
 render();
}catch(error){
 $('board').innerHTML='<p class="loading" role="alert">棋局暂时未能打开，请刷新重试。</p>';
 $('comment').textContent='暂时未能载入这盘讲棋。';
 $('segment-detail').textContent='请检查网络后刷新页面。';
 $('play').disabled=true;
 console.error('Lecture loading failed',error);
}

