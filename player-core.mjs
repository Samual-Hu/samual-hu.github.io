export function formatTime(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
export function indexAtTime(events,time){let lo=0,hi=events.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(events[mid].start<=time)lo=mid;else hi=mid-1;}return lo;}
export function chapterForMove(data,move){const n=Math.max(1,Math.min(data.moveCount,Math.round(move)));return Number(data.chapters[String(n)]??data.firstMain[String(n)]??0);}
export function curveMoveAtX(x,width,count=183,padding=30){const inner=Math.max(1,width-padding*2);return Math.max(1,Math.min(count,Math.round((x-padding)/inner*count)));}
export function scoreLabel(score){return score>=0?'黑领先 '+score.toFixed(1)+' 目':'白领先 '+Math.abs(score).toFixed(1)+' 目';}

