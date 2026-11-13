(() => {
  'use strict';
  const overlay=document.getElementById('helpDialog');
  const panel=overlay.querySelector('[role="dialog"]');
  const trigger=document.getElementById('openHelp');
  const closeButton=document.getElementById('closeHelp');
  const app=document.getElementById('app');
  let previousFocus=null,previousInert=false;

  function open(){
    if(!overlay.hidden)return;
    previousFocus=document.activeElement;
    previousInert=app.inert;
    app.inert=true;
    overlay.hidden=false;overlay.setAttribute('aria-hidden','false');
    trigger.setAttribute('aria-expanded','true');
    document.documentElement.classList.add('help-open');
    overlay.querySelectorAll('details').forEach(item=>{item.open=false;});
    panel.scrollTop=0;
    closeButton.focus();
  }
  function close(restoreFocus=true){
    if(overlay.hidden)return;
    overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
    trigger.setAttribute('aria-expanded','false');
    app.inert=previousInert;
    document.documentElement.classList.remove('help-open');
    if(restoreFocus)(previousFocus?.isConnected?previousFocus:trigger).focus();
  }
  trigger.addEventListener('click',open);
  closeButton.addEventListener('click',()=>close());
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  document.addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const items=[...panel.querySelectorAll('a[href],button,input,summary,[tabindex="0"]')]
      .filter(el=>!el.disabled&&el.getClientRects().length>0);
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  overlay.querySelectorAll('[data-help-open]').forEach(button=>button.addEventListener('click',()=>{
    close(false);
    document.getElementById(button.dataset.helpOpen)?.click();
  }));
  overlay.querySelectorAll('details').forEach(item=>item.addEventListener('toggle',()=>{
    if(item.open)overlay.querySelectorAll('details').forEach(other=>{if(other!==item)other.open=false;});
  }));
})();
