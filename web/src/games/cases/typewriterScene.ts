/**
 * Печатная машинка в 3D (three.js) для игры на падежи.
 *
 * Модуль не знает про React: он строит сцену на переданном canvas и отдаёт
 * управление — обновить лист, ударить по клавише, узнать клавишу под пальцем.
 * Кадры рисуются только пока что-то движется: в покое машинка не тратит ни
 * GPU, ни батарею.
 *
 * Единицы — сантиметры: машинка около 30 см в ширину.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { frameTail as tailText } from './data';
import { pawForKey, SERBIAN_LETTERS, TYPEWRITER_ROWS } from './keyboard';

export interface PaperLine {
  before: string;
  typed: string;
  after: string;
  status: 'ok' | 'slip' | 'wrong';
  correct?: string;
  missing?: string[];
}

export interface PaperState {
  lines: PaperLine[];
  before: string;
  typed: string;
  after: string;
}

export interface TypewriterScene {
  setPaper(state: PaperState): void;
  strike(key: string): void;
  resize(width: number, height: number): void;
  pick(clientX: number, clientY: number, touch: boolean): string | null;
  dispose(): void;
}

// --- Размеры ---

const PITCH = 1.95;
const CAP_R = 0.74;
const ROWS_Z = [-0.4, 1.75, 3.9];
const ROWS_Y = [3.45, 2.95, 2.45];
const ROWS_SHIFT = [-0.25, 0.1, 0.55];
const SPACE_Z = 5.95;
const SPACE_Y = 2.0;
const KEY_TRAVEL = 0.42;

const PLATEN_R = 1.5;
const PLATEN_Y = 7.6;
const PLATEN_Z = -8.6;
const PLATEN_LEN = 30;

// Лист выходит из-за валика спереди-сверху и откинут назад на подставку.
const PAPER_W = 26;
const PAPER_H = 20;
const PAPER_TILT = 0.42;
const PAPER_PX = 56; // точек текстуры на сантиметр
const FONT_CM = 0.86;
const LINE_CM = 1.3;
/** На телефоне шрифт на листе крупнее: машинка там мельче, а читать надо. */
const NARROW_TEXT = 1.3;
const MARGIN = 1.3;
const BASELINE_CM = 0.55; // текущая строка — у нижнего края видимого листа
/** Сколько строк над текущей должно быть видно. */
const VISIBLE_LINES = 5;
/** Угол от верха валика к зрителю, где лист отходит от него. */
const PAPER_LEAVES = 0.62;
const PAPER_ORIGIN = new THREE.Vector3(
  0,
  PLATEN_Y + (PLATEN_R + 0.03) * Math.cos(PAPER_LEAVES),
  PLATEN_Z + (PLATEN_R + 0.03) * Math.sin(PAPER_LEAVES),
);
const PAPER_UP = new THREE.Vector3(0, Math.cos(PAPER_TILT), -Math.sin(PAPER_TILT));
/** Точка печати: сюда бьют литеры, сюда же приходится текущая строка листа. */
const STRIKE = PAPER_ORIGIN.clone().addScaledVector(PAPER_UP, BASELINE_CM + FONT_CM * 0.3);

// Веер рычагов: оси на полукруге под точкой печати, головки лежат на войлоке.
const SEGMENT_R = 2.1;
const SEGMENT_DROP = 2.3;
const SEGMENT_CENTER = new THREE.Vector3(0, STRIKE.y - SEGMENT_DROP, STRIKE.z + 0.15);

// Плечи волка — за кадром, перед машинкой: к ним тянутся руки от кончиков лап.
const SHOULDERS = {
  left: new THREE.Vector3(-9.5, 11, 25),
  right: new THREE.Vector3(9.5, 11, 25),
};
const PAW_REST = {
  left: new THREE.Vector3(-6.4, 2.5, 7.3),
  right: new THREE.Vector3(6.4, 2.5, 7.3),
};

const ease = {
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  linear: (t: number) => t,
};

interface Tween {
  start: number;
  duration: number;
  step: (k: number) => void;
  easing: (t: number) => number;
  done?: () => void;
}

function shadowed<T extends THREE.Object3D>(object: T, receive = true): T {
  object.castShadow = true;
  object.receiveShadow = receive;
  return object;
}

function roundedBox(w: number, h: number, d: number, r: number, material: THREE.Material | THREE.Material[]) {
  return shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material));
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

/** Детерминированный «шум»: у каждой литеры своя сила удара. */
function jitter(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Значки «перевод строки» и «стереть» — рисунком: в Courier Prime их нет. */
function drawKeyIcon(ctx: CanvasRenderingContext2D, name: 'enter' | 'backspace') {
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (name === 'enter') {
    ctx.moveTo(176, 76);
    ctx.lineTo(176, 150);
    ctx.lineTo(84, 150);
    ctx.moveTo(116, 116);
    ctx.lineTo(80, 150);
    ctx.lineTo(116, 184);
  } else {
    ctx.moveTo(100, 84);
    ctx.lineTo(188, 84);
    ctx.lineTo(188, 172);
    ctx.lineTo(100, 172);
    ctx.lineTo(60, 128);
    ctx.closePath();
    ctx.moveTo(122, 106);
    ctx.lineTo(164, 150);
    ctx.moveTo(164, 106);
    ctx.lineTo(122, 150);
  }
  ctx.stroke();
}

export function createTypewriterScene(canvas: HTMLCanvasElement, options: { lowPower?: boolean } = {}): TypewriterScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);

  // --- Свет: тёплая лампа слева сверху, контровой справа сзади ---
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
  sun.position.set(-6, 40, 9);
  sun.castShadow = true;
  const shadowSize = options.lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 5, far: 90 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffe2b8, 0.9);
  rim.position.set(14, 12, -16);
  scene.add(rim);

  // --- Материалы ---
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x161412, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const matteBlack = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.7, metalness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.12, metalness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.3, metalness: 0.95 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x6b1d18, roughness: 1 });
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xeee0bd, roughness: 0.4, clearcoat: 0.5 });
  const paperPlain = new THREE.MeshStandardMaterial({ color: 0xf6f0de, roughness: 0.95, side: THREE.DoubleSide });

  const machine = new THREE.Group();
  scene.add(machine);

  // Тень на «столе»: машинка стоит, а не висит.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Корпус ---
  // Низкое основание: клавиатура стоит над ним террасами, а не утоплена.
  const base = roundedBox(29, 1.3, 19.5, 0.5, lacquer);
  base.position.set(0, 0.95, -1.4);
  machine.add(base);
  for (const x of [-12.5, 12.5]) {
    for (const z of [-9.5, 6.8]) {
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.3, 20), rubber));
      foot.position.set(x, 0.15, z);
      machine.add(foot);
    }
  }
  // Передняя планка, на которой отдыхают лапы, и хромированный кант.
  const frontLip = roundedBox(27.6, 0.55, 1.5, 0.22, lacquer);
  frontLip.position.set(0, 1.87, 7.3);
  machine.add(frontLip);
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 27.4, 12), chrome);
  trim.rotation.z = Math.PI / 2;
  trim.position.set(0, 1.72, 8.08);
  machine.add(trim);

  // Ступени клавиатуры: каждый ряд стоит на своей террасе.
  for (let row = 0; row < 3; row += 1) {
    const step = roundedBox(26, 1, 2.3, 0.2, matteBlack);
    step.position.set(0, ROWS_Y[row]! - 1.25, ROWS_Z[row]!);
    machine.add(step);
  }
  const spaceStep = roundedBox(26, 0.8, 2, 0.2, matteBlack);
  spaceStep.position.set(0, SPACE_Y - 0.85, SPACE_Z);
  machine.add(spaceStep);

  // Боковые кожухи вокруг механизма.
  for (const side of [-1, 1]) {
    // Кожухи начинаются за клавиатурой, у капота: дальше вперёд они
    // наезжали на крайние клавиши верхнего ряда.
    const cover = roundedBox(4.6, 5.4, 8.4, 0.9, lacquer);
    cover.position.set(side * 12.2, 3.7, -6.6);
    machine.add(cover);
  }
  const back = roundedBox(20, 4.2, 3, 0.8, lacquer);
  back.position.set(0, 3.1, -9.6);
  machine.add(back);

  // Капот над веером рычагов: скошенная лицевая панель с золотой надписью.
  const decal = canvasTexture(1024, 176, (ctx) => {
    ctx.fillStyle = '#161412';
    ctx.fillRect(0, 0, 1024, 176);
    const gold = ctx.createLinearGradient(0, 24, 0, 150);
    gold.addColorStop(0, '#f6dea0');
    gold.addColorStop(0.55, '#c9a24b');
    gold.addColorStop(1, '#8a6a25');
    ctx.fillStyle = gold;
    ctx.strokeStyle = gold;
    ctx.textAlign = 'center';
    ctx.font = '700 80px Lora, Georgia, serif';
    ctx.letterSpacing = '22px';
    ctx.fillText('ČITAVUK', 523, 104);
    ctx.font = '600 22px Lora, Georgia, serif';
    ctx.letterSpacing = '12px';
    ctx.fillText('PISAĆA MAŠINA · BEOGRAD', 518, 150);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, 124);
    ctx.lineTo(934, 124);
    ctx.stroke();
  });
  const decalMaterial = new THREE.MeshPhysicalMaterial({ map: decal.texture, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
  const hood = roundedBox(20, 3.2, 0.6, 0.25, [lacquer, lacquer, lacquer, lacquer, decalMaterial, lacquer]);
  hood.position.set(0, 3.7, -2.7);
  // Почти отвесно: наклонённая назад панель ловит блик потолочной лампы и
  // надпись выгорает в белое.
  hood.rotation.x = -0.28;
  machine.add(hood);
  // Внутренность корпуса за капотом — тёмная, чтобы веер читался на ней.
  const well = new THREE.Mesh(new THREE.BoxGeometry(19.8, 0.2, 7), matteBlack);
  well.position.set(0, 2.2, -6.2);
  well.receiveShadow = true;
  machine.add(well);

  // --- Веер рычагов с литерами ---
  const letters = TYPEWRITER_ROWS.flat();
  const typebars = new Map<string, { pivot: THREE.Object3D; rest: THREE.Quaternion; hit: THREE.Quaternion }>();
  const segment = new THREE.Mesh(new THREE.TorusGeometry(SEGMENT_R, 0.22, 10, 40, Math.PI), steel);
  segment.rotation.x = -Math.PI / 2;
  segment.rotation.z = Math.PI;
  segment.position.copy(SEGMENT_CENTER);
  segment.scale.set(1, 1, 0.6);
  machine.add(segment);
  const barLength = Math.hypot(SEGMENT_R, SEGMENT_DROP);
  const restRing = SEGMENT_R + barLength * Math.cos(0.3);
  const feltRing = new THREE.Mesh(new THREE.TorusGeometry(restRing, 0.24, 8, 48, Math.PI), felt);
  feltRing.rotation.x = -Math.PI / 2;
  feltRing.rotation.z = Math.PI;
  feltRing.position.copy(SEGMENT_CENTER).add(new THREE.Vector3(0, -barLength * Math.sin(0.3) - 0.3, 0));
  machine.add(feltRing);
  const barGeometry = new THREE.BoxGeometry(0.11, 0.07, barLength);
  barGeometry.translate(0, 0, barLength / 2);
  const headGeometry = new THREE.BoxGeometry(0.28, 0.24, 0.22);
  headGeometry.translate(0, 0, barLength - 0.08);
  const forward = new THREE.Vector3(0, 0, 1);
  letters.forEach((letter, index) => {
    // Слева направо через перёд: a = 0 — левый край полукруга.
    const angle = Math.PI * (0.07 + (0.86 * index) / (letters.length - 1));
    const radial = new THREE.Vector3(-Math.cos(angle), 0, Math.sin(angle));
    const pivot = new THREE.Object3D();
    pivot.position.copy(SEGMENT_CENTER).addScaledVector(radial, SEGMENT_R);
    const restDir = radial.clone().multiplyScalar(Math.cos(0.3)).add(new THREE.Vector3(0, -Math.sin(0.3), 0)).normalize();
    const hitDir = STRIKE.clone().sub(pivot.position).normalize();
    const rest = new THREE.Quaternion().setFromUnitVectors(forward, restDir);
    // Удар — поворот в той же вертикальной плоскости, без скручивания рычага.
    const hit = new THREE.Quaternion().setFromUnitVectors(restDir, hitDir).multiply(rest);
    pivot.add(shadowed(new THREE.Mesh(barGeometry, steel), false), new THREE.Mesh(headGeometry, chrome));
    pivot.quaternion.copy(rest);
    machine.add(pivot);
    typebars.set(letter, { pivot, rest, hit });
  });

  // Красно-чёрная лента на катушках, под строкой: литера бьёт сквозь неё.
  const ribbonY = STRIKE.y - FONT_CM * 0.85;
  for (const side of [-1, 1]) {
    const spool = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 36), chrome));
    spool.position.set(side * 7, ribbonY - 0.2, STRIKE.z + 1.2);
    machine.add(spool);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.54, 36), rubber);
    reel.position.copy(spool.position);
    machine.add(reel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), chrome);
    hub.position.copy(spool.position);
    machine.add(hub);
  }
  const ribbon = new THREE.Group();
  const ribbonWidth = 14;
  const black = new THREE.Mesh(new THREE.PlaneGeometry(ribbonWidth, 0.3), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, side: THREE.DoubleSide }));
  const red = new THREE.Mesh(new THREE.PlaneGeometry(ribbonWidth, 0.3), new THREE.MeshStandardMaterial({ color: 0x9e2b25, roughness: 0.7, side: THREE.DoubleSide }));
  black.position.y = 0.15;
  red.position.y = -0.15;
  ribbon.add(black, red);
  ribbon.position.set(0, ribbonY, STRIKE.z + 0.35);
  ribbon.rotation.x = -PAPER_TILT;
  machine.add(ribbon);
  // Прозрачный ограничитель с рисками — по нему видно, куда бьёт литера.
  const guideTexture = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = 'rgba(230,236,240,0.3)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(179,38,30,0.9)';
    ctx.fillRect(126, 0, 4, 64);
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    for (let x = 8; x < 256; x += 24) ctx.fillRect(x, 0, 2, 16);
  });
  const guide = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.7),
    new THREE.MeshStandardMaterial({ map: guideTexture.texture, transparent: true, metalness: 0.6, roughness: 0.2, side: THREE.DoubleSide }),
  );
  guide.position.copy(STRIKE).addScaledVector(PAPER_UP, -FONT_CM * 0.4 - 0.4).add(new THREE.Vector3(0, 0, 0.2));
  guide.rotation.x = -PAPER_TILT;
  machine.add(guide);

  // --- Каретка: валик, ручки, подставка, лист, рычаг возврата ---
  const carriage = new THREE.Group();
  machine.add(carriage);
  const platen = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(PLATEN_R, PLATEN_R, PLATEN_LEN, 48), rubber));
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0, PLATEN_Y, PLATEN_Z);
  carriage.add(platen);
  // Каретка едет по рельсу на задней части корпуса.
  const railBar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PLATEN_LEN + 1, 0.8, 1.6), lacquer));
  railBar.position.set(0, PLATEN_Y - 2.1, PLATEN_Z - 0.4);
  carriage.add(railBar);
  const knobProfile = [
    [0, 0], [1.1, 0], [1.25, 0.2], [1.25, 1.2], [1.05, 1.45], [0.45, 1.6], [0, 1.6],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  for (const side of [-1, 1]) {
    const knob = shadowed(new THREE.Mesh(new THREE.LatheGeometry(knobProfile, 48), chrome));
    knob.rotation.z = -side * Math.PI / 2;
    knob.position.set(side * (PLATEN_LEN / 2), PLATEN_Y, PLATEN_Z);
    carriage.add(knob);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.5, 40), matteBlack));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(side * (PLATEN_LEN / 2 - 0.4), PLATEN_Y, PLATEN_Z);
    carriage.add(cap);
  }
  // Подставка для бумаги за валиком.
  // Лист и подставка тень на «пол» не бросают: пола не видно, и тень
  // висела бы в воздухе справа от машинки.
  const table = new THREE.Mesh(new RoundedBoxGeometry(PAPER_W + 1, 9, 0.25, 4, 0.1), chrome);
  table.position.set(0, PLATEN_Y + 4.3, PLATEN_Z - 3);
  table.rotation.x = -PAPER_TILT - 0.1;
  carriage.add(table);
  // Прижимная планка с роликами поверх листа.
  const bailPoint = PAPER_ORIGIN.clone().addScaledVector(PAPER_UP, BASELINE_CM + LINE_CM * 3.5).add(new THREE.Vector3(0, 0, 0.12));
  const bail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, PLATEN_LEN - 3, 12), chrome));
  bail.rotation.z = Math.PI / 2;
  bail.position.copy(bailPoint);
  carriage.add(bail);
  for (const x of [-7.5, 7.5]) {
    const roller = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 18), rubber));
    roller.rotation.z = Math.PI / 2;
    roller.position.set(x, bailPoint.y, bailPoint.z + 0.1);
    carriage.add(roller);
  }
  const platenAxis = new THREE.Vector3(0, PLATEN_Y, PLATEN_Z);
  for (const side of [-1, 1]) {
    const x = side * (PLATEN_LEN / 2 - 1.6);
    const length = bailPoint.distanceTo(platenAxis);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, length), chrome);
    arm.position.set(x, (bailPoint.y + PLATEN_Y) / 2, (bailPoint.z + PLATEN_Z) / 2);
    arm.lookAt(new THREE.Vector3(x, bailPoint.y, bailPoint.z));
    carriage.add(arm);
  }

  // Рычаг возврата каретки — слева, изогнутый хром.
  const leverBase = new THREE.Vector3(-PLATEN_LEN / 2 + 0.2, PLATEN_Y + 0.6, PLATEN_Z + 0.9);
  const leverCurve = new THREE.CatmullRomCurve3([
    leverBase,
    leverBase.clone().add(new THREE.Vector3(-0.8, 1.2, 1.4)),
    leverBase.clone().add(new THREE.Vector3(-1.5, 1.6, 3.4)),
    leverBase.clone().add(new THREE.Vector3(-1.4, 1.5, 5.4)),
  ]);
  const lever = new THREE.Group();
  const leverTube = shadowed(new THREE.Mesh(new THREE.TubeGeometry(leverCurve, 48, 0.2, 14), chrome));
  const leverTip = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), matteBlack));
  leverTip.position.copy(leverCurve.getPoint(1));
  leverTube.userData.key = 'enter';
  leverTip.userData.key = 'enter';
  lever.add(leverTube, leverTip);
  carriage.add(lever);

  // Лист: ровная часть с текстом и изгиб вокруг валика снизу.
  const paperCanvas = document.createElement('canvas');
  paperCanvas.width = PAPER_W * PAPER_PX;
  paperCanvas.height = PAPER_H * PAPER_PX;
  const paperTexture = new THREE.CanvasTexture(paperCanvas);
  paperTexture.colorSpace = THREE.SRGBColorSpace;
  paperTexture.anisotropy = 8;
  const paperGeometry = new THREE.PlaneGeometry(PAPER_W, PAPER_H);
  paperGeometry.translate(0, PAPER_H / 2, 0);
  // Бумага матовая (без бликов шрифт не сереет) и слегка светится сама: под
  // тональной кривой иначе выходит серой.
  const paper = new THREE.Mesh(
    paperGeometry,
    new THREE.MeshLambertMaterial({ map: paperTexture, emissive: 0xffffff, emissiveMap: paperTexture, emissiveIntensity: 0.3, side: THREE.DoubleSide }),
  );
  paper.receiveShadow = true;
  paper.position.copy(PAPER_ORIGIN);
  paper.rotation.x = -PAPER_TILT;
  carriage.add(paper);
  const wrap = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATEN_R + 0.03, PLATEN_R + 0.03, PAPER_W, 40, 1, true, PAPER_LEAVES, Math.PI - PAPER_LEAVES + 0.3),
    paperPlain,
  );
  wrap.rotation.z = Math.PI / 2;
  wrap.position.set(0, PLATEN_Y, PLATEN_Z);
  wrap.receiveShadow = true;
  carriage.add(wrap);

  // --- Клавиши ---
  const keyObjects = new Map<string, { group: THREE.Group; rest: THREE.Vector3 }>();
  const pickables: THREE.Object3D[] = [leverTube, leverTip];
  const redrawKeys: (() => void)[] = [];
  const capGeometry = new THREE.CylinderGeometry(CAP_R * 0.86, CAP_R * 0.86, 0.3, 40);
  const ringGeometry = new THREE.CylinderGeometry(CAP_R, CAP_R * 0.96, 0.34, 40, 1, true);
  const ringTopGeometry = new THREE.RingGeometry(CAP_R * 0.84, CAP_R, 40);
  ringTopGeometry.rotateX(-Math.PI / 2);
  const stemGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8);
  stemGeometry.translate(0, -1.1, 0);

  function addKey(name: string, x: number, y: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const stem = new THREE.Mesh(stemGeometry, steel);
    stem.rotation.x = -0.45;
    const ring = shadowed(new THREE.Mesh(ringGeometry, chrome));
    const ringTop = new THREE.Mesh(ringTopGeometry, chrome);
    ringTop.position.y = 0.17;
    const serbian = SERBIAN_LETTERS.includes(name);
    const face = canvasTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(116, 100, 12, 128, 128, 134);
      g.addColorStop(0, serbian ? '#fff6ee' : '#fffbef');
      g.addColorStop(0.72, serbian ? '#f2dccd' : '#f0e4c4');
      g.addColorStop(1, serbian ? '#cfa08e' : '#cdb98b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = serbian ? '#7a1b15' : '#14110d';
      ctx.strokeStyle = ctx.fillStyle;
      if (name === 'enter' || name === 'backspace') {
        drawKeyIcon(ctx, name);
        return;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 176px "Courier Prime", "Courier New", monospace';
      const label = name.toLocaleUpperCase('sr');
      // У Č, Ć, Š, Ž, Đ сверху знак: сдвигаем букву чуть ниже, чтобы
      // уместился.
      ctx.fillText(label, 128, serbian && name !== 'đ' ? 150 : 140);
    });
    redrawKeys.push(face.redraw);
    // На крышке цилиндра текстура лежит «на боку»: разворачиваем, чтобы
    // буква читалась с места машинистки.
    face.texture.center.set(0.5, 0.5);
    face.texture.rotation = Math.PI / 2;
    const top = new THREE.MeshPhysicalMaterial({ map: face.texture, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    const cap = shadowed(new THREE.Mesh(capGeometry, [ivory, top, ivory]));
    cap.position.y = 0.03;
    for (const mesh of [ring, ringTop, cap]) mesh.userData.key = name;
    group.add(stem, ring, ringTop, cap);
    machine.add(group);
    keyObjects.set(name, { group, rest: group.position.clone() });
    pickables.push(ring, ringTop, cap);
  }

  TYPEWRITER_ROWS.forEach((row, rowIndex) => {
    row.forEach((letter, i) => {
      addKey(letter, (i - 5.5 + ROWS_SHIFT[rowIndex]!) * PITCH, ROWS_Y[rowIndex]!, ROWS_Z[rowIndex]!);
    });
  });
  addKey('enter', (7.6 - 5.5 + ROWS_SHIFT[2]!) * PITCH + 0.4, ROWS_Y[2]!, ROWS_Z[2]!);
  addKey('backspace', 5.6 * PITCH, SPACE_Y + 0.3, SPACE_Z);

  // Пробел — хромированная планка на двух рычажках.
  const spaceGroup = new THREE.Group();
  spaceGroup.position.set(-1, SPACE_Y, SPACE_Z);
  const spaceBar = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 13, 8, 24), chrome));
  spaceBar.rotation.z = Math.PI / 2;
  spaceBar.userData.key = ' ';
  spaceGroup.add(spaceBar);
  for (const x of [-5.4, 5.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 2.6), steel);
    // Рычажки уходят назад и вниз, под клавиатуру.
    arm.position.set(x, -0.55, -1.2);
    arm.rotation.x = -0.35;
    spaceGroup.add(arm);
  }
  machine.add(spaceGroup);
  keyObjects.set(' ', { group: spaceGroup, rest: spaceGroup.position.clone() });
  pickables.push(spaceBar);

  // --- Лапы Читавука: серый мех, светлые пальцы с коготками и рукав
  // вышитой рубахи, как у маскота ---
  const furTexture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#9a9ea8';
    ctx.fillRect(0, 0, 256, 256);
    // Короткие штрихи вдоль руки: мех, а не пластик.
    for (let i = 0; i < 900; i += 1) {
      const x = jitter(i * 1.3) * 256;
      const y = jitter(i * 2.7 + 5) * 256;
      const light = jitter(i * 4.1 + 9);
      ctx.strokeStyle = light > 0.5 ? `rgba(215,218,225,${0.25 + light * 0.3})` : `rgba(60,62,70,${0.2 + light * 0.3})`;
      ctx.lineWidth = 1.5 + jitter(i * 7.3) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (jitter(i * 5.9) - 0.5) * 6, y + 10 + jitter(i * 3.3) * 10);
      ctx.stroke();
    }
  });
  furTexture.texture.wrapS = THREE.RepeatWrapping;
  furTexture.texture.wrapT = THREE.RepeatWrapping;
  furTexture.texture.repeat.set(2, 2);
  const fur = new THREE.MeshStandardMaterial({ map: furTexture.texture, color: 0xb9bcc4, roughness: 1 });
  const furLight = new THREE.MeshStandardMaterial({ map: furTexture.texture, color: 0xffffff, emissive: 0x2a2b2e, roughness: 1 });
  const claw = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4 });
  const sleeveTexture = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#f7f2e7';
    ctx.fillRect(0, 0, 512, 256);
    // Холст: редкая сетка нитей.
    ctx.fillStyle = 'rgba(160,140,110,0.12)';
    for (let x = 0; x < 512; x += 6) ctx.fillRect(x, 0, 1, 256);
    for (let y = 0; y < 256; y += 6) ctx.fillRect(0, y, 512, 1);
    // Вышивка у манжеты — низ текстуры, ближний к запястью край.
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(0, 214, 512, 10);
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, x % 32 === 0 ? 184 : 204);
    ctx.stroke();
    for (let x = 16; x < 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 146);
      ctx.lineTo(x + 20, 166);
      ctx.moveTo(x + 20, 146);
      ctx.lineTo(x, 166);
      ctx.stroke();
    }
    ctx.fillStyle = '#2e2a2f';
    ctx.fillRect(0, 232, 512, 4);
  });
  const sleeve = new THREE.MeshStandardMaterial({ map: sleeveTexture.texture, roughness: 0.95, side: THREE.DoubleSide });
  const lace = new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.9 });

  function buildPaw(side: 'left' | 'right') {
    const paw = new THREE.Group();
    const mirror = side === 'left' ? 1 : -1;
    // Начало координат — кончики пальцев; рука уходит по +z к плечу.
    const toes: [number, number][] = [[-1.08, 0.5], [-0.38, 0.08], [0.38, 0.08], [1.08, 0.5]];
    for (const [x, z] of toes) {
      const toe = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), furLight));
      toe.scale.set(0.95, 0.8, 1.1);
      toe.position.set(x * mirror, 0.5, z + 0.3);
      paw.add(toe);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 10), claw);
      tip.rotation.x = -Math.PI / 2 - 0.35;
      tip.position.set(x * mirror, 0.4, z - 0.2);
      paw.add(tip);
    }
    const palm = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.3, 28, 18), fur));
    palm.scale.set(1.05, 0.52, 1.0);
    palm.position.set(0, 0.45, 2.15);
    paw.add(palm);
    const cuffFur = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.36, 12, 28), furLight));
    cuffFur.position.set(0, 0.5, 3.3);
    paw.add(cuffFur);
    const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.12, 0.94, 5.6, 28, 1, true), fur));
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0.5, 3.3 + 2.8);
    paw.add(arm);
    const cloth = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.3, 9, 32, 1, true), sleeve));
    cloth.rotation.x = Math.PI / 2;
    cloth.position.set(0, 0.5, 8 + 4.5);
    paw.add(cloth);
    const laceRing = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.13, 8, 36), lace));
    laceRing.position.set(0, 0.5, 8);
    paw.add(laceRing);
    return paw;
  }

  const paws = { left: buildPaw('left'), right: buildPaw('right') };
  function aimPaw(side: 'left' | 'right') {
    paws[side].lookAt(SHOULDERS[side]);
  }
  for (const side of ['left', 'right'] as const) {
    paws[side].position.copy(PAW_REST[side]);
    aimPaw(side);
    machine.add(paws[side]);
  }

  // --- Анимации и отрисовка по требованию ---
  const tweens = new Set<Tween>();
  let frame = 0;
  let disposed = false;

  function requestRender() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(tick);
  }

  // Канал — то, чем движет анимация (лапа, клавиша, каретка). Новая
  // анимация в канале отменяет прежнюю вместе с её продолжением: иначе на
  // медленных кадрах старый подъём лапы доигрывал после возврата и лапа
  // зависала над клавиатурой.
  const channels = new Map<string, Tween>();

  function animate(channel: string, duration: number, step: (k: number) => void, easing = ease.out, done?: () => void) {
    const previous = channels.get(channel);
    if (previous) tweens.delete(previous);
    const tween: Tween = { start: performance.now(), duration, step, easing, done };
    tweens.add(tween);
    channels.set(channel, tween);
    requestRender();
  }

  function tick(now: number) {
    frame = 0;
    for (const tween of [...tweens]) {
      const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
      tween.step(tween.easing(t));
      if (t >= 1) {
        tweens.delete(tween);
        tween.done?.();
      }
    }
    for (const [channel, tween] of channels) {
      if (!tweens.has(tween)) channels.delete(channel);
    }
    renderer.render(scene, camera);
    if (tweens.size) requestRender();
  }

  // --- Лист ---
  let paperState: PaperState = { lines: [], before: '', typed: '', after: '' };
  let feed = 0;
  let textScale = 1;
  let fontPx = 0;
  let charPx = 0;
  let charW = 0;
  let linePx = 0;
  let typeFont = '';
  function setTextScale(scale: number) {
    textScale = scale;
    fontPx = Math.round(FONT_CM * scale * PAPER_PX);
    charPx = fontPx * 0.6; // Courier Prime моноширинный: литера — 0,6 кегля
    charW = charPx / PAPER_PX;
    linePx = LINE_CM * scale * PAPER_PX;
    // Полужирный: тонкий Courier при уменьшении текстуры сливается в серое.
    typeFont = `700 ${fontPx}px "Courier Prime", "Courier New", monospace`;
  }
  setTextScale(1);
  const INK = '#12100d';
  const RED_INK = '#9a1d16';

  function drawTyped(ctx: CanvasRenderingContext2D, text: string, column: number, y: number, seed: number, color = INK) {
    ctx.fillStyle = color;
    for (let i = 0; i < text.length; i += 1) {
      const r = jitter(seed * 97 + column + i);
      // Неровный удар: одни литеры пропечатаны сильнее, другие слабее и чуть
      // ниже — как у настоящей машинки с подсохшей лентой.
      ctx.globalAlpha = 0.8 + r * 0.2;
      ctx.fillText(text[i]!, MARGIN * PAPER_PX + (column + i) * charPx + (r - 0.5) * 1.4, y + (jitter(seed * 31 + column + i) - 0.5) * 1.8);
    }
    ctx.globalAlpha = 1;
  }

  function redrawPaper() {
    const ctx = paperCanvas.getContext('2d')!;
    const w = paperCanvas.width;
    const h = paperCanvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#f4ecd9');
    bg.addColorStop(1, '#fbf6ea');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = typeFont;
    ctx.textBaseline = 'alphabetic';
    const baseY = h - BASELINE_CM * PAPER_PX + feed * linePx;
    const { lines, before, typed, after } = paperState;
    const visible = lines.slice(-Math.ceil(PAPER_H / (LINE_CM * textScale)));
    visible.forEach((line, i) => {
      const y = baseY - (visible.length - i) * linePx;
      const seed = lines.length - visible.length + i + 1;
      const lead = line.before ? `${line.before} ` : '';
      drawTyped(ctx, lead, 0, y, seed);
      let column = lead.length;
      if (line.status === 'wrong') {
        // Ошибка зачёркнута красной чертой, верная форма — рядом красным.
        // Пустой ответ («Не знаю») не зачёркивается: сразу верная форма.
        if (line.typed) {
          drawTyped(ctx, line.typed, column, y, seed, 'rgba(18,16,13,0.55)');
          const x0 = MARGIN * PAPER_PX + column * charPx - 2;
          const x1 = x0 + line.typed.length * charPx + 4;
          ctx.strokeStyle = RED_INK;
          ctx.lineWidth = Math.max(3, fontPx * 0.08);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y - fontPx * 0.28);
          ctx.lineTo(x1, y - fontPx * 0.34);
          ctx.stroke();
          column += line.typed.length + 1;
        }
        drawTyped(ctx, line.correct ?? '', column, y, seed, RED_INK);
        column += (line.correct ?? '').length;
      } else {
        drawTyped(ctx, line.typed, column, y, seed);
        if (line.status === 'slip') {
          ctx.strokeStyle = RED_INK;
          ctx.lineWidth = 3;
          ctx.beginPath();
          const x0 = MARGIN * PAPER_PX + column * charPx;
          for (let px = 0; px <= line.typed.length * charPx; px += 3) ctx.lineTo(x0 + px, y + 9 + Math.sin(px / 3.5) * 2.6);
          ctx.stroke();
        }
        column += line.typed.length;
      }
      drawTyped(ctx, tailText(line.after), column, y, seed);
      column += tailText(line.after).length;
      if (line.status === 'slip' && line.missing?.length) {
        // Пометка на полях от руки: какой чёрточки не хватило.
        ctx.fillStyle = RED_INK;
        ctx.font = `italic 600 ${Math.round(fontPx * 0.74)}px Lora, Georgia, serif`;
        ctx.fillText(`нужна ${line.missing.join(', ')}`, MARGIN * PAPER_PX + (column + 1.5) * charPx, y);
        ctx.font = typeFont;
      }
    });
    const lead = before ? `${before} ` : '';
    drawTyped(ctx, lead + typed, 0, baseY, lines.length + 1);
    // Продолжение фразы — карандашом, чтобы было видно, куда вписать слово.
    const rest = tailText(after);
    if (rest) {
      ctx.fillStyle = 'rgba(80,72,64,0.42)';
      const x = MARGIN * PAPER_PX + (lead.length + typed.length + 1) * charPx;
      ctx.fillText(rest.trimStart(), x + (rest.startsWith(' ') ? charPx : 0), baseY);
    }
    paperTexture.needsUpdate = true;
  }

  function lineLength(state: PaperState) {
    return (state.before ? state.before.length + 1 : 0) + state.typed.length;
  }

  function carriageTarget() {
    // Точка печати неподвижна (x = 0): каретка едет так, чтобы следующая
    // литера пришлась ровно в неё.
    return PAPER_W / 2 - MARGIN - lineLength(paperState) * charW - charW / 2;
  }

  function moveCarriage(duration: number, easing = ease.linear) {
    const from = carriage.position.x;
    const to = carriageTarget();
    animate('carriage', duration, (k) => {
      carriage.position.x = from + (to - from) * k;
    }, easing);
  }

  // --- Удар ---
  const pawTimers = new Map<'left' | 'right', number>();

  function pressKey(name: string) {
    const key = keyObjects.get(name);
    if (!key) return;
    const down = name === ' ' ? 0.3 : KEY_TRAVEL;
    const from = key.group.position.y;
    const bottom = key.rest.y - down;
    animate(`key:${name}`, 45, (k) => {
      key.group.position.y = from + (bottom - from) * k;
    }, ease.out, () => {
      animate(`key:${name}`, 130, (k) => {
        key.group.position.y = bottom + down * k;
      }, ease.out);
    });
    // Отдача корпуса: вся машинка едва заметно вздрагивает от удара.
    animate('jolt', 110, (k) => {
      machine.position.y = -0.05 * Math.sin(Math.PI * k);
    }, ease.linear);
  }

  function swingTypebar(name: string) {
    const bar = typebars.get(name);
    if (!bar) return;
    const from = bar.pivot.quaternion.clone();
    animate(`bar:${name}`, 60, (k) => {
      bar.pivot.quaternion.slerpQuaternions(from, bar.hit, k);
    }, (t) => t * t, () => {
      // Отскок от валика — быстрее, чем падение обратно на войлок.
      animate(`bar:${name}`, 150, (k) => {
        bar.pivot.quaternion.slerpQuaternions(bar.hit, bar.rest, k);
      }, ease.out);
    });
  }

  function movePaw(name: string) {
    const key = keyObjects.get(name);
    if (!key) return;
    const side = name === ' ' ? (Math.random() < 0.5 ? 'left' : 'right') : name === 'enter' || name === 'backspace' ? 'right' : pawForKey(name);
    const paw = paws[side];
    const target = key.rest.clone().add(new THREE.Vector3(0, 0.2, 0.05));
    if (name === ' ') target.set(side === 'left' ? -2.6 : 2.6, SPACE_Y + 0.25, SPACE_Z - 0.1);
    const from = paw.position.clone();
    const channel = `paw:${side}`;
    window.clearTimeout(pawTimers.get(side));
    animate(channel, 80, (k) => {
      // Лапа идёт дугой: приподнимается и опускается на клавишу.
      paw.position.lerpVectors(from, target, k).y += Math.sin(Math.PI * k) * 0.8;
      aimPaw(side);
    }, ease.out, () => {
      // Жмяк: лапа продавливает клавишу вместе с ней и приподнимается.
      const pressed = target.clone().add(new THREE.Vector3(0, -KEY_TRAVEL, 0));
      animate(channel, 45, (k) => {
        paw.position.lerpVectors(target, pressed, k);
        aimPaw(side);
      }, ease.out, () => {
        const hover = target.clone().add(new THREE.Vector3(0, 0.75, 0.35));
        animate(channel, 160, (k) => {
          paw.position.lerpVectors(pressed, hover, k);
          aimPaw(side);
        }, ease.out);
      });
    });
    pawTimers.set(side, window.setTimeout(() => {
      const start = paw.position.clone();
      animate(channel, 460, (k) => {
        paw.position.lerpVectors(start, PAW_REST[side], k);
        aimPaw(side);
      }, ease.inOut);
    }, 900));
  }

  // --- Камера под размер ---
  // Точки, которые обязаны попасть в кадр. На широком экране — машинка
  // целиком; на узком бока с ручками валика уходят за край, остаются
  // клавиатура, лапы и лист.
  const paperTop = PAPER_ORIGIN.clone().addScaledVector(PAPER_UP, BASELINE_CM + LINE_CM * (VISIBLE_LINES + 0.6));
  const paperTopNarrow = PAPER_ORIGIN.clone().addScaledVector(PAPER_UP, BASELINE_CM + LINE_CM * NARROW_TEXT * (VISIBLE_LINES - 1 + 0.6));
  const fitWide = [
    ...[-1, 1].flatMap((s) => [
      new THREE.Vector3(s * 14.6, 0, 8.4),
      new THREE.Vector3(s * 14.6, 0, -11),
      new THREE.Vector3(s * (PLATEN_LEN / 2 + 1.6), PLATEN_Y + 1.3, PLATEN_Z),
      new THREE.Vector3(s * (PAPER_W / 2), paperTop.y, paperTop.z),
      new THREE.Vector3(s * 7, 3.5, 11),
    ]),
  ];
  const fitNarrow = [
    ...[-1, 1].flatMap((s) => [
      new THREE.Vector3(s * 12.4, 1.4, 5),
      new THREE.Vector3(s * 12.2, 3.4, -0.4),
      new THREE.Vector3(s * 10, 0.5, 8.4),
      new THREE.Vector3(s * 8, paperTopNarrow.y, paperTopNarrow.z),
      new THREE.Vector3(s * 6, 3.5, 11),
    ]),
  ];
  const aim = new THREE.Vector3();
  const probe = new THREE.Vector3();

  function frameCamera(aspect: number) {
    const narrow = aspect < 1.1;
    const points = narrow ? fitNarrow : fitWide;
    const pitch = THREE.MathUtils.degToRad(narrow ? 44 : 35);
    const direction = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    aim.set(0, 5, -1.5);
    const place = (distance: number) => {
      camera.position.copy(aim).addScaledVector(direction, distance);
      camera.lookAt(aim);
      camera.updateMatrixWorld();
    };
    const bounds = () => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        probe.copy(point).project(camera);
        minX = Math.min(minX, probe.x);
        maxX = Math.max(maxX, probe.x);
        minY = Math.min(minY, probe.y);
        maxY = Math.max(maxY, probe.y);
      }
      return { minX, maxX, minY, maxY };
    };
    let distance = 60;
    for (let pass = 0; pass < 3; pass += 1) {
      // Ближайшее расстояние, при котором всё влезает с полями.
      let lo = 15;
      let hi = 200;
      for (let i = 0; i < 28; i += 1) {
        const mid = (lo + hi) / 2;
        place(mid);
        const b = bounds();
        if (b.minX >= -0.96 && b.maxX <= 0.96 && b.minY >= -0.97 && b.maxY <= 0.95) hi = mid;
        else lo = mid;
      }
      distance = hi;
      place(distance);
      // Центрируем по вертикали: сдвигаем точку взгляда вдоль «верха» камеры.
      const b = bounds();
      const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      aim.y += ((b.maxY + b.minY) / 2) * halfHeight * Math.cos(pitch);
      aim.z -= ((b.maxY + b.minY) / 2) * halfHeight * Math.sin(pitch);
    }
    place(distance);
  }

  function resize(width: number, height: number) {
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameCamera(camera.aspect);
    const scale = camera.aspect < 1.1 ? NARROW_TEXT : 1;
    if (scale !== textScale) {
      setTextScale(scale);
      redrawPaper();
      const moving = channels.get('carriage');
      if (moving) tweens.delete(moving);
      carriage.position.x = carriageTarget();
    }
    requestRender();
  }

  const raycaster = new THREE.Raycaster();
  const projected = new THREE.Vector3();

  function pick(clientX: number, clientY: number, touch: boolean) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const direct = hit?.object.userData.key as string | undefined;
    if (direct) return direct;
    if (!touch) return null;
    // Палец толще курсора: берём ближайшую клавишу в пределах пары
    // сантиметров экрана.
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [name, { group }] of keyObjects) {
      if (name === ' ') continue;
      projected.copy(group.position).project(camera);
      const dx = ((projected.x - pointer.x) / 2) * rect.width;
      const dy = ((projected.y - pointer.y) / 2) * rect.height;
      const d = Math.hypot(dx, dy);
      if (d < bestDistance) {
        bestDistance = d;
        best = name;
      }
    }
    // Пробел — длинная планка: расстояние до отрезка, а не до центра.
    const ends = [-6.5, 6.5].map((dx) => {
      projected.copy(spaceGroup.position).add(new THREE.Vector3(dx, 0, 0)).project(camera);
      return new THREE.Vector2(((projected.x + 1) / 2) * rect.width, ((1 - projected.y) / 2) * rect.height);
    });
    const finger = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
    const along = ends[1]!.clone().sub(ends[0]!);
    const t = THREE.MathUtils.clamp(finger.clone().sub(ends[0]!).dot(along) / along.lengthSq(), 0, 1);
    const spaceDistance = finger.distanceTo(ends[0]!.clone().addScaledVector(along, t));
    if (spaceDistance < bestDistance && spaceDistance < 20) return ' ';
    return bestDistance < 28 ? best : null;
  }

  // Шрифты для холстов: без них первая отрисовка ушла бы системным шрифтом.
  void Promise.all([
    // С сербскими буквами в образце: они в отдельном файле шрифта.
    document.fonts.load('700 40px "Courier Prime"', 'aČčĆćŠšŽžĐđ'),
    document.fonts.load('700 80px Lora', 'ČITAVUK MAŠINA'),
    document.fonts.load('italic 600 32px Lora', 'nužna čćšžđ'),
  ]).then(() => {
    if (disposed) return;
    for (const redraw of redrawKeys) redraw();
    decal.redraw();
    redrawPaper();
    requestRender();
  }).catch(() => {});

  redrawPaper();
  carriage.position.x = carriageTarget();

  return {
    setPaper(state) {
      const previous = paperState;
      paperState = state;
      const newLine = state.lines.length > previous.lines.length;
      const delta = lineLength(state) - lineLength(previous);
      if (newLine) {
        // Перевод строки: валик проворачивается, лист поднимается на строку.
        const turn = platen.rotation.x;
        animate('feed', 300, (k) => {
          feed = 1 - k;
          platen.rotation.x = turn - k * ((LINE_CM * textScale) / PLATEN_R);
          redrawPaper();
        }, ease.out);
        moveCarriage(480, ease.inOut);
      } else {
        redrawPaper();
        // Буква — короткий шаг каретки; начало новой фразы — её прогон.
        if (delta) moveCarriage(Math.abs(delta) === 1 ? 70 : Math.min(320, 60 + Math.abs(delta) * 25), Math.abs(delta) === 1 ? ease.linear : ease.out);
      }
      requestRender();
    },
    strike(key) {
      pressKey(key);
      movePaw(key);
      if (key.length === 1 && key !== ' ') swingTypebar(key);
      if (key === 'enter') {
        animate('lever', 260, (k) => {
          lever.position.x = -0.9 * Math.sin(Math.PI * k);
        }, ease.linear);
      }
    },
    resize,
    pick,
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      for (const id of pawTimers.values()) window.clearTimeout(id);
      const disposedGeometry = new Set<THREE.BufferGeometry>();
      const disposedMaterial = new Set<THREE.Material>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry && !disposedGeometry.has(mesh.geometry)) {
          disposedGeometry.add(mesh.geometry);
          mesh.geometry.dispose();
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          if (disposedMaterial.has(material)) continue;
          disposedMaterial.add(material);
          (material as THREE.MeshStandardMaterial).map?.dispose();
          material.dispose();
        }
      });
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      // Контекст WebGL освобождается сразу, а не когда до него доберётся
      // сборщик: браузер держит их не больше пары десятков.
      renderer.forceContextLoss();
    },
  };
}
