(() => {
  'use strict';
  const modal=document.getElementById('homeTrailerModal');
  const home=document.getElementById('homeTrailerVideo');
  const calendar=document.getElementById('calendarTrailerVideo');
  const player=document.getElementById('calendarTrailerPlayer');
  const launch=document.getElementById('openHomeTrailer');
  const start=document.getElementById('playCalendarTrailer');
  const close=document.getElementById('closeHomeTrailer');
  const english=()=>document.documentElement.lang==='en';

  function status(video,value='') {
    document.getElementById(video===home?'homeTrailerStatus':'calendarTrailerStatus').textContent=value;
  }
  function failure(video) {
    status(video,english()?'The video could not be played. Check your connection and press Play to try again.':'Das Video konnte nicht abgespielt werden. Prüfe deine Verbindung und drücke erneut auf Start.');
    if(video===calendar)player.classList.remove('playing');
  }
  function play(video) {
    status(video);
    if(video.error)video.load();
    // Invoke play directly during the tap so iPhone can start playback with sound.
    try { const pending=video.play();if(pending?.catch)pending.catch(error=>{if(error.name!=='AbortError')failure(video);}); }
    catch {failure(video);}
  }
  function closeModal() {
    if(!modal.classList.contains('show'))return;
    home.pause();home.currentTime=0;
    modal.classList.remove('show');modal.setAttribute('aria-hidden','true');
    launch.focus();
  }
  start.addEventListener('click',()=>{
    home.pause();player.classList.add('playing');play(calendar);
  });
  launch.addEventListener('click',()=>{
    calendar.pause();modal.classList.add('show');modal.setAttribute('aria-hidden','false');
    close.focus();play(home);
  });
  close.addEventListener('click',closeModal);
  modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
  window.addEventListener('rfl:screen-changed',event=>{if(event.detail!=='calendar')calendar.pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){home.pause();calendar.pause();}});
  for(const video of [home,calendar]) {
    video.addEventListener('error',()=>failure(video));
    video.addEventListener('playing',()=>status(video));
    video.addEventListener('play',()=>{(video===home?calendar:home).pause();});
  }
})();
