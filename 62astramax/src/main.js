const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];

const icons = {
  help:'<circle cx="12" cy="12" r="8.8"/><path d="M9.7 9.1c.1-1.4 1.1-2.3 2.6-2.3 1.5 0 2.5.9 2.5 2.3 0 2.2-2.8 2.3-2.8 4.3"/><path d="M12 16.7h.01" stroke-width="2.7"/>',
  expand:'<path d="M8.5 3.7H3.7v4.8m11-4.8h5.6v4.8M3.7 15.5v4.8h4.8m11.8-4.8v4.8h-5.2"/>',
  shrink:'<path d="M3.5 8.5h5v-5m7 0v5h5m0 7h-5v5m-7 0v-5h-5"/>',
  orbit:'<path d="M18.8 11.2c2.1 1.1 2.9 2.2 2.5 3.2-.8 2.2-5.8 2.7-11.3 1.1-5.4-1.5-9.1-4.5-8.2-6.7.4-1 1.7-1.5 3.3-1.6"/><path d="m18 8.5.9 2.9-2.9.6"/><circle cx="12" cy="10.8" r="5.7"/>',
  minus:'<path d="M5 12h14"/>', plus:'<path d="M5 12h14m-7-7v14"/>',
  sliders:'<path d="M3.5 6.5h5m4.3 0h7.7M3.5 12h10m4.3 0h2.7m-17 5.5h3m4.3 0h9.7"/><circle cx="10.7" cy="6.5" r="2.1"/><circle cx="15.7" cy="12" r="2.1"/><circle cx="8.7" cy="17.5" r="2.1"/>',
  pause:'<path d="M8.4 5.2v13.6m7.2-13.6v13.6" stroke-width="3.3"/>',
  play:'<path d="m7.8 4.6 11.7 7.4-11.7 7.4z" fill="currentColor" stroke-width=".8"/>',
  'rotate-3d':'<path d="M5.2 8c1.5-1.9 3.8-3.1 6.8-3.1 4.7 0 8.5 3 8.5 6.8 0 1.6-.7 3-1.9 4.2m.3-3.9-.3 4.2 4.1-.4M18.8 16c-1.6 2-4 3.1-6.8 3.1-4.7 0-8.5-3-8.5-6.8 0-1.5.6-2.9 1.8-4.2m-.2 4 .3-4.2-4.2.2"/><path d="m9.5 11.9 2.5-1.5 2.5 1.5-2.5 1.6z" fill="currentColor" stroke="none"/>',
  reset:'<path d="M4.2 9.3a7.8 7.8 0 1 1-.1 5.4"/><path d="M4 4.6v5h5"/>',
  close:'<path d="m5.5 5.5 13 13m0-13-13 13"/>',
  book:'<path d="M12 6.7c-1.8-1.5-5-2-9-1.6v13.5c4-.5 7 .1 9 1.8 2-1.7 5-2.3 9-1.8V5.1c-4-.4-7.2.1-9 1.6Zm0 .2v13"/>',
  cube:'<path d="m12 2.7 8.2 4.6v9.3L12 21.3l-8.2-4.7V7.3zM3.8 7.3 12 12l8.2-4.7M12 12v9.3"/>',
  hoof:'<g transform="rotate(-17 12 12)"><path d="M5.5 20C3.8 17.5 3.2 15 3.2 12c0-5.3 3.7-9.1 8.8-9.1s8.8 3.8 8.8 9.1c0 3.1-.7 5.7-2.3 8l-3.5-1.2c1.6-2.4 2.2-4.8 2.2-7.1 0-3.1-2.1-5.7-5.2-5.7s-5.2 2.6-5.2 5.7c0 2.4.6 4.7 2.2 7.1z" stroke-width="1.1"/><path d="m6.6 16.3.6-.2m-1.4-3.7h.6m.3-4.3.6.3m3-3.9.3.6m6.4 2.9-.6.4m1.7 3.9h-.7m-.5 4 .6.2" stroke-width="1.4"/></g>',
  foot:'<path class="sole" d="M6 19.3c-1.6-2.2-2.1-5-1.8-7.7.4-4.6 3.4-8 7.8-8s7.4 3.4 7.8 8c.3 2.7-.3 5.5-1.8 7.7l-2.7-.6 1-4.7c-1.3 1.2-2.8 1.8-4.3 1.8s-3-.6-4.3-1.8l1 4.7z" fill="none" stroke-width="1.3"/>'
};
function iconMarkup(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
}
all('[data-icon]').forEach(el => { el.innerHTML=iconMarkup(el.dataset.icon); });

const stage=$('#stage'), canvas=$('#horse-canvas'), speed=$('#speed');
const motionButtons=all('[data-motion]'), coatButtons=all('[data-coat]'), feet=all('[data-foot]');
const state={coat:'bay',motion:'idle',rate:1,playing:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,auto:false};
let studio;
const observations={
  idle:['Standing at rest','Watch the ears turn, the head settle and the tail sway as the horse stands.'],
  walk:['Four-beat walk','Each hoof lands in turn. Follow the hind hoof and then the fore hoof on the same side.'],
  trot:['Two-beat trot','Diagonal pairs lift and land together, with a brief moment of suspension between beats.'],
};

function setPlaying(playing) {
  state.playing=playing;
  const b=$('#playback'), label=playing?'Pause animation':'Resume animation';
  b.innerHTML=iconMarkup(playing?'pause':'play'); b.title=label; b.setAttribute('aria-label',label);
  studio?.setPlaying(playing);
}
function setMotion(mode) {
  state.motion=mode; studio?.setMotion(mode);
  motionButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motion===mode)));
  $('#observation-title').textContent=observations[mode][0];
  $('#observation-text').textContent=observations[mode][1];
  setPlaying(true);
}
function setCoat(id) {
  state.coat=id; studio?.setCoat(id);
  coatButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.coat===id)));
}
function setAuto(on) {
  state.auto=on; studio?.setAuto(on);
  $('#auto-orbit').setAttribute('aria-checked',String(on));
}
function setSpeed() {
  state.rate=Number(speed.value);
  speed.style.setProperty('--amount',String((state.rate-.5)*100)+'%');
  $('#speed-value').textContent=speed.value+'×';
  speed.setAttribute('aria-valuetext',speed.value+' times normal speed');
  studio?.setSpeed(state.rate);
}
function resetView() { setAuto(false); studio?.resetCamera(); }
function setFootfall(mask) {
  feet.forEach((el,i)=>{
    const down=Boolean(mask & (1<<i));
    el.classList.toggle('grounded',down);
    const name=el.querySelector('abbr').title;
    el.setAttribute('aria-label',name+(down?', grounded':', lifted'));
  });
}
motionButtons.forEach(b=>b.addEventListener('click',()=>setMotion(b.dataset.motion)));
coatButtons.forEach(b=>b.addEventListener('click',()=>setCoat(b.dataset.coat)));
$('#playback').addEventListener('click',()=>setPlaying(!state.playing));
$('#auto-orbit').addEventListener('click',()=>setAuto(!state.auto));
$('#reset-view').addEventListener('click',resetView);
$('#zoom-in').addEventListener('click',()=>studio?.magnify(1.18));
$('#zoom-out').addEventListener('click',()=>studio?.magnify(1/1.18));
speed.addEventListener('input',setSpeed);
setPlaying(state.playing);

const fullButton=$('#expand');
function expanded() { return document.fullscreenElement===stage || stage.classList.contains('expanded'); }
function syncFull() {
  const on=expanded(), label=on?'Exit full screen':'Expand viewer';
  fullButton.innerHTML=iconMarkup(on?'shrink':'expand');
  fullButton.title=label; fullButton.setAttribute('aria-label',label);
}
async function toggleFull() {
  if(document.fullscreenElement===stage) await document.exitFullscreen();
  else if(stage.classList.contains('expanded')) stage.classList.remove('expanded');
  else {
    try {
      if(!stage.requestFullscreen) throw Error();
      await stage.requestFullscreen();
    } catch { stage.classList.add('expanded'); }
  }
  syncFull();
}
fullButton.addEventListener('click',toggleFull);
document.addEventListener('fullscreenchange',syncFull);

all('[data-open]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.open).showModal()));
all('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
all('dialog').forEach(dialog=>{
  const title=dialog.querySelector('h2');
  title.id=dialog.id+'-heading'; dialog.setAttribute('aria-labelledby',title.id);
  dialog.addEventListener('click',e=>{
    if(e.target!==dialog) return;
    const r=dialog.getBoundingClientRect();
    if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dialog.close();
  });
});
$('#studio-tab').addEventListener('click',()=>{ stage.scrollIntoView({block:'nearest'});canvas.focus({preventScroll:true}); });
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && stage.classList.contains('expanded')) {stage.classList.remove('expanded');syncFull();return;}
  if($('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.target.matches('input, textarea, select')) return;
  if(e.code==='Space' && !e.target.closest('button,a')) {e.preventDefault();setPlaying(!state.playing);}
  else if(e.key==='1'||e.key==='2'||e.key==='3') setMotion(['idle','walk','trot'][Number(e.key)-1]);
  else if(e.key.toLowerCase()==='r') resetView();
  else if(e.key.toLowerCase()==='f') toggleFull();
  else if(e.key==='+'||e.key==='=') studio?.magnify(1.18);
  else if(e.key==='-') studio?.magnify(1/1.18);
  else if(e.key==='?') $('#guide-dialog').showModal();
});

// A small seeded paper grain keeps the studio background continuous as it resizes.
const grain=document.createElement('canvas'); grain.width=grain.height=96;
const gc=grain.getContext('2d'), pixels=gc.createImageData(96,96);
let rng=3109;
for(let i=0;i<pixels.data.length;i+=4) {
  rng=(Math.imul(rng,1664525)+1013904223)>>>0;
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=rng>>>24;
  pixels.data[i+3]=255;
}
gc.putImageData(pixels,0,0);
$('.stage-grain').style.backgroundImage='url('+grain.toDataURL()+')';

const loading=$('#stage-load');
try {
  const {openStudio}=await import('./studio.js');
  studio=openStudio(canvas,()=>setAuto(false),setFootfall);
  studio.setPlaying(state.playing); studio.setAuto(state.auto); studio.setMotion(state.motion);
  studio.setSpeed(state.rate); studio.setCoat(state.coat);
  loading.hidden=true;
} catch(error) {
  loading.replaceChildren(document.createTextNode('The 3D renderer could not start. Enable WebGL in your browser and reload the studio.'));
  $('.live-pill').hidden=true;
  console.error(error);
} finally { stage.setAttribute('aria-busy','false'); }
