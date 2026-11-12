const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function fixture(){
  const elements=new Map(),docEvents={},windowEvents={};
  const document={hidden:false,documentElement:{lang:'de'},getElementById(id){
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{textContent:'',currentTime:0,error:null,plays:0,pauses:0,events:{},
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
        setAttribute(){},focus(){},addEventListener(name,fn){this.events[name]=fn;},
        play(){this.plays++;this.events.play?.();return this.rejection?Promise.reject(this.rejection):Promise.resolve();},
        pause(){this.pauses++;},load(){this.error=null;},click(){this.events.click?.();}
      });
    }
    return elements.get(id);
  },addEventListener(name,fn){docEvents[name]=fn;}};
  const window={addEventListener(name,fn){windowEvents[name]=fn;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../trailer-player.js'),'utf8'),{document,window});
  return{el:id=>document.getElementById(id),document,docEvents,windowEvents};
}
test('a single tap starts the calendar film and switching players stops overlapping audio',()=>{
  const f=fixture(),calendar=f.el('calendarTrailerVideo'),home=f.el('homeTrailerVideo');
  assert.equal(calendar.plays+home.plays,0);
  f.el('playCalendarTrailer').click();
  assert.equal(calendar.plays,1);assert.equal(f.el('calendarTrailerPlayer').classList.contains('playing'),true);
  const paused=calendar.pauses;f.el('openHomeTrailer').click();
  assert.equal(home.plays,1);assert(calendar.pauses>paused);assert.equal(f.el('homeTrailerModal').classList.contains('show'),true);
  home.currentTime=12;f.docEvents.keydown({key:'Escape'});
  assert.equal(home.currentTime,0);assert.equal(f.el('homeTrailerModal').classList.contains('show'),false);
});
test('leaving the calendar and backgrounding the app stop trailer audio',()=>{
  const f=fixture(),calendar=f.el('calendarTrailerVideo'),home=f.el('homeTrailerVideo');
  f.el('playCalendarTrailer').click();const paused=calendar.pauses;
  f.windowEvents['rfl:screen-changed']({detail:'home'});assert(calendar.pauses>paused);
  const homePaused=home.pauses;f.document.hidden=true;f.docEvents.visibilitychange();assert(home.pauses>homePaused);
});
test('a playback error offers another Start attempt instead of leaving an inert overlay',async()=>{
  const f=fixture(),calendar=f.el('calendarTrailerVideo');
  calendar.rejection={name:'NotSupportedError'};f.el('playCalendarTrailer').click();await Promise.resolve();
  assert.equal(f.el('calendarTrailerPlayer').classList.contains('playing'),false);
  assert.match(f.el('calendarTrailerStatus').textContent,/erneut auf Start/);
  calendar.rejection=null;f.el('playCalendarTrailer').click();calendar.events.playing();
  assert.equal(calendar.plays,2);assert.equal(f.el('calendarTrailerStatus').textContent,'');
});
