import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rouletteProgress, rouletteStop, ROULETTE_SPIN_MS } from './rouletteMath';

export interface RouletteGenre { id: string; ru: string }
export interface RouletteScene {
  setGenres(genres: RouletteGenre[]): void;
  spin(genre: string, reduced: boolean): void;
  dispose(): void;
}

/** Общая сцена для сайта и приложения. В покое нет render loop. */
export function createRouletteScene(canvas: HTMLCanvasElement, callbacks: { landed(): void; tick(): void; failed(): void }): RouletteScene {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .82;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4,4,4,-4,.1,40);
  camera.position.set(0,10,6.8); camera.lookAt(0,.2,0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,.04);
  room.dispose(); pmrem.dispose();
  scene.environment = environment.texture;
  scene.add(new THREE.HemisphereLight(0xfff4d9,0x251712,1.5));
  const key = new THREE.DirectionalLight(0xffe0ae,2); key.position.set(-4,7,5); scene.add(key);
  const rimLight = new THREE.DirectionalLight(0xffffff,1.8); rimLight.position.set(4,4,-5); scene.add(rimLight);
  const gold = new THREE.MeshStandardMaterial({color:0xc7a36b,metalness:.85,roughness:.24});
  const wood = new THREE.MeshStandardMaterial({color:0x3b211d,metalness:.08,roughness:.48});
  const ivory = new THREE.MeshStandardMaterial({color:0xfff2d9,metalness:.15,roughness:.22});
  const rotor = new THREE.Group(); scene.add(rotor);
  const wheel = new THREE.Group(); rotor.add(wheel);
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number, parent: THREE.Object3D = scene) => {
    const obj = new THREE.Mesh(geometry,material); obj.position.y=y; parent.add(obj);return obj;
  };
  mesh(new THREE.CylinderGeometry(3.45,3.32,.42,96),wood,-.1);
  mesh(new THREE.CylinderGeometry(3.27,3.4,.16,96),gold,.17);
  mesh(new THREE.CylinderGeometry(3.17,3.17,.14,96),wood,.29);
  for (const [radius,tube,y] of [[3.35,.08,.28],[3.08,.055,.44],[1.14,.04,.5]] as const) {
    const ring=mesh(new THREE.TorusGeometry(radius,tube,10,96),gold,y);
    ring.rotation.x=-Math.PI/2;
  }
  mesh(new THREE.CylinderGeometry(2.98,2.98,.12,96),wood,.37,rotor);
  const center=mesh(new THREE.ConeGeometry(.85,.22,64),gold,.59,rotor);center.rotation.y=.2;
  mesh(new THREE.CylinderGeometry(.17,.22,.45,32),gold,.92,rotor);
  mesh(new THREE.SphereGeometry(.22,24,16),gold,1.17,rotor);
  for(let i=0;i<4;i++) {
    const arm=mesh(new THREE.CylinderGeometry(.045,.045,1.5,12),gold,.98,rotor);
    arm.rotation.z=Math.PI/2;arm.rotation.y=i*Math.PI/2;
  }
  const ball=mesh(new THREE.SphereGeometry(.11,24,16),ivory,.66);ball.position.set(0,.65,-2.74);
  const pointer=mesh(new THREE.ConeGeometry(.14,.33,3),gold,.55);pointer.rotation.x=Math.PI/2;pointer.position.z=-3.2;
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d')!;const shadowGradient=ctx.createRadialGradient(64,64,12,64,64,64);
  shadowGradient.addColorStop(0,'rgba(33,19,14,.26)');shadowGradient.addColorStop(1,'rgba(33,19,14,0)');ctx.fillStyle=shadowGradient;ctx.fillRect(0,0,128,128);
  const shadow=mesh(new THREE.PlaneGeometry(8.2,8.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}),-.35);shadow.rotation.x=-Math.PI/2;
  let genres: RouletteGenre[]=[], frame=0, spinning=false, started=0, from=0, to=0, lastSector=-1, disposed=false;
  const goldGeometryDisposeOnly = (group: THREE.Object3D) => group.traverse(obj=>{
    if(obj instanceof THREE.Mesh){obj.geometry.dispose();for(const mat of Array.isArray(obj.material)?obj.material:[obj.material]){
      if(mat===gold)continue;const map=(mat as THREE.MeshStandardMaterial).map;if(map)map.dispose();mat.dispose();
    }}
  });
  const render = () => {if(!disposed&&!document.hidden)renderer.render(scene,camera);};
  const resize = () => {const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const half=Math.max(3.3,3.7*h/w);camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();render();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const finish = () => {rotor.rotation.y=to;ball.position.set(0,.63,-2.72);spinning=false;render();callbacks.landed();};
  const animate = (now:number) => {
    if(disposed||!spinning)return;if(document.hidden){frame=0;return;}
    const elapsed=now-started,p=rouletteProgress(elapsed);rotor.rotation.y=from+(to-from)*p;
    const sector=Math.floor(rotor.rotation.y*genres.length/(Math.PI*2));if(sector!==lastSector){lastSector=sector;callbacks.tick();}
    const angle=Math.PI/2-6*Math.PI*2*(1-p),radius=3.04-.32*p;
    ball.position.set(Math.cos(angle)*radius,.65+Math.abs(Math.sin(p*Math.PI*10))*.12*(1-p),-Math.sin(angle)*radius);
    render();if(elapsed>=ROULETTE_SPIN_MS)finish();else frame=requestAnimationFrame(animate);
  };
  const visibility = () => {if(!document.hidden){if(spinning&&!frame)frame=requestAnimationFrame(animate);else render();}else{cancelAnimationFrame(frame);frame=0;}};
  document.addEventListener('visibilitychange',visibility);
  const lost = (event: Event) => {event.preventDefault();cancelAnimationFrame(frame);callbacks.failed();};canvas.addEventListener('webglcontextlost',lost);resize();
  return {
    setGenres(items){
      if(genres.length===items.length&&genres.every((g,i)=>g.id===items[i]?.id&&g.ru===items[i]?.ru))return;
      if(spinning)return;genres=items.length?items:[{id:'any',ru:'Любая тема'}];goldGeometryDisposeOnly(wheel);wheel.clear();const step=2*Math.PI/genres.length;
      genres.forEach((genre,i)=>{
        const color=i%2===0?0x8f2c26:0x201c1b;
        const slice=mesh(new THREE.RingGeometry(1.16,2.94,12,1,i*step,step*.985),new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.12,side:THREE.DoubleSide}),.445,wheel);slice.rotation.x=-Math.PI/2;
        const art=document.createElement('canvas');art.width=384;art.height=80;const context=art.getContext('2d')!;context.fillStyle='#f5dfb5';context.font='600 32px "Noto Sans", Arial, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(genre.ru,192,40,370);
        const texture=new THREE.CanvasTexture(art);texture.colorSpace=THREE.SRGBColorSpace;
        const label=mesh(new THREE.PlaneGeometry(1.27,.265),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}),.452,wheel);const angle=(i+.5)*step;label.position.x=Math.cos(angle)*2.15;label.position.z=-Math.sin(angle)*2.15;label.rotation.x=-Math.PI/2;label.rotation.z=angle-Math.PI/2;
        const divider=mesh(new THREE.BoxGeometry(.025,.08,1.78),gold,.48,wheel);divider.position.set(Math.cos(i*step)*2.03,.48,-Math.sin(i*step)*2.03);divider.rotation.y=i*step-Math.PI/2;
      });render();
    },
    spin(genre,reduced){cancelAnimationFrame(frame);from=rotor.rotation.y;const index=Math.max(0,genres.findIndex(g=>g.id===genre));to=rouletteStop(index,genres.length,from);lastSector=-1;if(reduced){finish();return;}spinning=true;started=performance.now();frame=requestAnimationFrame(animate);},
    dispose(){disposed=true;spinning=false;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();scene.traverse(obj=>{if(obj instanceof THREE.Mesh){geometries.add(obj.geometry);for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(mat);}});materials.forEach(mat=>{const map=(mat as THREE.MeshStandardMaterial).map;if(map)textures.add(map);mat.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());environment.dispose();renderer.dispose();},
  };
}
