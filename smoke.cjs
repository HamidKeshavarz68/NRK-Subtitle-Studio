function makeEl() {
  return {
    style:{setProperty(){}}, dataset:{}, classList:{toggle(){},add(){},remove(){}},
    options:[], hidden:false, title:"", textContent:"", innerHTML:"",
    setAttribute(){}, getAttribute(){return null;}, appendChild(c){return c;},
    addEventListener(){}, removeEventListener(){}, querySelector(){return makeEl();},
    querySelectorAll(){return [];}, getBoundingClientRect(){return {width:500,height:600,left:0,top:0};},
    closest(){return null;},
  };
}
global.document = { documentElement: makeEl(), body: makeEl(), fullscreenElement:null, createElement(){return makeEl();}, addEventListener(){}, querySelector(){return makeEl();}, querySelectorAll(){return [];} };
global.window = { innerWidth:1200, innerHeight:800, addEventListener(){}, setTimeout:setTimeout, location:{href:"https://tv.nrk.no/"} };
global.self = { setTimeout:setTimeout };
global.location = { href:"https://tv.nrk.no/" };
global.history = { pushState(){}, replaceState(){} };
global.localStorage = { getItem(){return null;}, setItem(){} };
global.ResizeObserver = class { observe(){} };
global.chrome = { runtime:{ getURL(p){return p;}, getManifest(){return {version:"0.0.2"};}, sendMessage(){}, onMessage:{addListener(){}} } };
global.MutationObserver = class { observe(){} disconnect(){} };
try { require('./dist/content/index.js'); console.log('SMOKE OK'); }
catch (e) { console.error('SMOKE FAIL', e && e.stack || e); process.exit(1); }
