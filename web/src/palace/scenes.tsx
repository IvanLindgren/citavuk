import type { ReactNode } from 'react';

/**
 * Комнаты дворца памяти.
 *
 * Сцена — не картинка с невидимыми областями поверх, а список предметов: каждый
 * предмет сам себя рисует и сам является местом, куда вешается слово. Иначе
 * пришлось бы держать две согласованные вещи — рисунок и координаты кликабельных
 * зон — и однажды сдвинуть одно, забыв про другое.
 *
 * Рисунки собственные, векторные и без файлов: сцена весит килобайты, работает
 * без сети и одинаково резка на любом экране.
 *
 * Цвета заданы явно, а не токенами темы. Иллюстрация — цельная картинка, и
 * перекрашивать её вслед за интерфейсом значит ломать её же светотень; вместо
 * этого сцена лежит на своём фоне и одинаково читается в обеих темах.
 */

export interface PalaceObject {
  id: string;
  /** Подпись по-сербски: место запоминается вместе со своим названием. */
  label: string;
  /** Перевод подписи — раздел всё-таки для тех, кто язык учит. */
  ru: string;
  x: number;
  y: number;
  art: ReactNode;
}

export interface PalaceScene {
  id: string;
  title: string;
  subtitle: string;
  /** Задник: небо или стена. */
  backdrop: ReactNode;
  objects: PalaceObject[];
}

export const SCENE_WIDTH = 1000;
export const SCENE_HEIGHT = 620;

const C = {
  wall: '#efe2c6',
  wallDark: '#e3d3b0',
  floor: '#c9a97e',
  floorDark: '#b8946a',
  wood: '#a9754a',
  woodDark: '#8a5c38',
  ink: '#3a2a1c',
  red: '#9e2b25',
  redBright: '#c23b33',
  blue: '#2e3b5b',
  blueSoft: '#7d8db8',
  gold: '#c9a24b',
  green: '#4b7a4a',
  greenSoft: '#6f9b63',
  sky: '#bcd4e6',
  stone: '#d8d2c6',
  white: '#faf5e9',
  glass: '#cfe3ef',
};

// --- Мелкие детали, повторяющиеся в разных сценах ---------------------------

function Window({ w = 120, h = 100 }: { w?: number; h?: number }) {
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} fill={C.glass} />
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={6}
        fill="none"
        stroke={C.woodDark}
        strokeWidth={7}
      />
      <path
        d={`M0 ${-h / 2} V ${h / 2} M ${-w / 2} 0 H ${w / 2}`}
        stroke={C.woodDark}
        strokeWidth={6}
      />
    </>
  );
}

function Lamp() {
  return (
    <>
      <path d="M0 -70 V -34" stroke={C.ink} strokeWidth={5} />
      <path d="M-34 -34 L34 -34 L22 2 L-22 2 Z" fill={C.gold} />
      <circle cx={0} cy={10} r={7} fill={C.white} opacity={0.85} />
    </>
  );
}

function Plant() {
  return (
    <>
      <path d="M-22 14 L22 14 L16 54 L-16 54 Z" fill={C.red} />
      <path
        d="M0 14 C -6 -18 -30 -26 -36 -44 C -12 -44 2 -26 4 -6 C 10 -30 30 -40 44 -38 C 30 -18 14 -10 6 14 Z"
        fill={C.green}
      />
    </>
  );
}

function Tree() {
  return (
    <>
      <path d="M-9 90 L-6 10 L6 10 L9 90 Z" fill={C.woodDark} />
      <circle cx={0} cy={-24} r={58} fill={C.green} />
      <circle cx={-40} cy={4} r={36} fill={C.greenSoft} />
      <circle cx={40} cy={2} r={34} fill={C.greenSoft} />
    </>
  );
}

// --- Сцена: кухня ------------------------------------------------------------

const KITCHEN: PalaceScene = {
  id: 'kuhinja',
  title: 'Кухня',
  subtitle: 'Кухиња',
  backdrop: (
    <>
      <rect width={SCENE_WIDTH} height={430} fill={C.wall} />
      <rect y={430} width={SCENE_WIDTH} height={SCENE_HEIGHT - 430} fill={C.floor} />
      <path d={`M0 430 H ${SCENE_WIDTH}`} stroke={C.floorDark} strokeWidth={6} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M${-120 + i * 190} ${SCENE_HEIGHT} L${120 + i * 150} 430`}
          stroke={C.floorDark}
          strokeWidth={3}
          opacity={0.5}
        />
      ))}
    </>
  ),
  objects: [
    {
      id: 'prozor',
      label: 'прозор',
      ru: 'окно',
      x: 165,
      y: 150,
      art: <Window w={150} h={120} />,
    },
    {
      id: 'frizider',
      label: 'фрижидер',
      ru: 'холодильник',
      x: 390,
      y: 300,
      art: (
        <>
          <rect x={-52} y={-140} width={104} height={280} rx={12} fill={C.white} />
          <rect
            x={-52}
            y={-140}
            width={104}
            height={280}
            rx={12}
            fill="none"
            stroke={C.stone}
            strokeWidth={5}
          />
          <path d="M-52 -32 H52" stroke={C.stone} strokeWidth={5} />
          <rect x={30} y={-104} width={9} height={54} rx={4} fill={C.blueSoft} />
          <rect x={30} y={0} width={9} height={54} rx={4} fill={C.blueSoft} />
        </>
      ),
    },
    {
      id: 'polica',
      label: 'полица',
      ru: 'полка',
      x: 640,
      y: 150,
      art: (
        <>
          <rect x={-90} y={30} width={180} height={12} rx={4} fill={C.wood} />
          {[-70, -50, -32, -8, 14, 40].map((x, i) => (
            <rect
              key={x}
              x={x}
              y={30 - (i % 3 === 0 ? 62 : 50)}
              width={16}
              height={i % 3 === 0 ? 62 : 50}
              rx={3}
              fill={[C.red, C.blue, C.gold, C.green, C.redBright, C.blueSoft][i]}
            />
          ))}
        </>
      ),
    },
    {
      id: 'lampa',
      label: 'лампа',
      ru: 'лампа',
      x: 860,
      y: 130,
      art: <Lamp />,
    },
    {
      id: 'sto',
      label: 'сто',
      ru: 'стол',
      x: 620,
      y: 440,
      art: (
        <>
          <rect x={-120} y={-16} width={240} height={20} rx={8} fill={C.wood} />
          <path d="M-96 4 L-88 96 M96 4 L88 96" stroke={C.woodDark} strokeWidth={12} />
        </>
      ),
    },
    {
      id: 'stolica',
      label: 'столица',
      ru: 'стул',
      x: 840,
      y: 430,
      art: (
        <>
          <rect x={-38} y={-84} width={12} height={90} rx={5} fill={C.woodDark} />
          <rect x={-38} y={-84} width={76} height={12} rx={5} fill={C.woodDark} />
          <rect x={-42} y={-2} width={84} height={14} rx={6} fill={C.wood} />
          <path d="M-32 12 L-30 84 M32 12 L30 84" stroke={C.woodDark} strokeWidth={9} />
        </>
      ),
    },
    {
      id: 'sesir',
      label: 'шоља',
      ru: 'чашка',
      x: 578,
      y: 404,
      art: (
        <>
          <path d="M-20 -18 H20 L16 16 H-16 Z" fill={C.white} />
          <path d="M20 -10 C 36 -10 36 8 20 8" stroke={C.white} strokeWidth={7} fill="none" />
          <path d="M-8 -30 C -4 -38 -12 -42 -8 -50" stroke={C.stone} strokeWidth={4} fill="none" />
        </>
      ),
    },
    {
      id: 'cvet',
      label: 'цвет',
      ru: 'цветок',
      x: 120,
      y: 440,
      art: <Plant />,
    },
  ],
};

// --- Сцена: гостиная ---------------------------------------------------------

const LIVING: PalaceScene = {
  id: 'dnevna',
  title: 'Гостиная',
  subtitle: 'Дневна соба',
  backdrop: (
    <>
      <rect width={SCENE_WIDTH} height={420} fill={C.wallDark} />
      <rect y={420} width={SCENE_WIDTH} height={SCENE_HEIGHT - 420} fill={C.wood} />
      <path d={`M0 420 H ${SCENE_WIDTH}`} stroke={C.woodDark} strokeWidth={6} />
      <ellipse cx={520} cy={545} rx={330} ry={62} fill={C.red} opacity={0.35} />
      <ellipse cx={520} cy={545} rx={250} ry={44} fill={C.gold} opacity={0.3} />
    </>
  ),
  objects: [
    {
      id: 'prozor',
      label: 'прозор',
      ru: 'окно',
      x: 140,
      y: 160,
      art: <Window w={140} h={130} />,
    },
    {
      id: 'sat',
      label: 'сат',
      ru: 'часы',
      x: 500,
      y: 120,
      art: (
        <>
          <circle cx={0} cy={0} r={46} fill={C.white} stroke={C.woodDark} strokeWidth={8} />
          <path d="M0 -26 V2 L20 14" stroke={C.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
        </>
      ),
    },
    {
      id: 'polica',
      label: 'полица за књиге',
      ru: 'книжная полка',
      x: 830,
      y: 260,
      art: (
        <>
          <rect x={-90} y={-120} width={180} height={250} rx={8} fill={C.woodDark} />
          <rect x={-78} y={-108} width={156} height={100} fill={C.wall} />
          <rect x={-78} y={8} width={156} height={100} fill={C.wall} />
          {[-70, -50, -30, -10, 12, 34].map((x, i) => (
            <rect key={x} x={x} y={-100} width={16} height={84} fill={[C.red, C.blue, C.gold, C.green, C.redBright, C.blueSoft][i]} />
          ))}
          {[-70, -48, -24, 2, 26].map((x, i) => (
            <rect key={x} x={x} y={20} width={18} height={80} fill={[C.blue, C.gold, C.red, C.greenSoft, C.blueSoft][i]} />
          ))}
        </>
      ),
    },
    {
      id: 'kauc',
      label: 'кауч',
      ru: 'диван',
      x: 430,
      y: 430,
      art: (
        <>
          <rect x={-160} y={-70} width={320} height={80} rx={22} fill={C.blue} />
          <rect x={-170} y={-10} width={340} height={64} rx={20} fill={C.blueSoft} />
          <rect x={-176} y={-40} width={30} height={80} rx={14} fill={C.blue} />
          <rect x={146} y={-40} width={30} height={80} rx={14} fill={C.blue} />
          <path d="M-120 54 V78 M120 54 V78" stroke={C.woodDark} strokeWidth={10} />
        </>
      ),
    },
    {
      id: 'televizor',
      label: 'телевизор',
      ru: 'телевизор',
      x: 250,
      y: 250,
      art: (
        <>
          <rect x={-86} y={-56} width={172} height={112} rx={8} fill={C.ink} />
          <rect x={-76} y={-46} width={152} height={92} rx={4} fill={C.blueSoft} />
          <path d="M0 56 V78 M-34 78 H34" stroke={C.ink} strokeWidth={8} />
        </>
      ),
    },
    {
      id: 'lampa',
      label: 'подна лампа',
      ru: 'торшер',
      x: 700,
      y: 400,
      art: (
        <>
          <path d="M0 -40 V 100" stroke={C.ink} strokeWidth={6} />
          <path d="M-40 -40 L40 -40 L26 -96 L-26 -96 Z" fill={C.gold} />
          <ellipse cx={0} cy={102} rx={30} ry={9} fill={C.ink} />
        </>
      ),
    },
    {
      id: 'macka',
      label: 'мачка',
      ru: 'кошка',
      x: 596,
      y: 528,
      art: (
        <>
          <ellipse cx={0} cy={8} rx={44} ry={22} fill={C.stone} />
          <circle cx={30} cy={-16} r={20} fill={C.stone} />
          <path d="M20 -30 L18 -44 L32 -34 Z M40 -34 L52 -44 L46 -28 Z" fill={C.stone} />
          <path d="M-42 4 C -66 -6 -62 -30 -46 -30" stroke={C.stone} strokeWidth={9} fill="none" />
          <circle cx={26} cy={-18} r={2.6} fill={C.ink} />
          <circle cx={38} cy={-18} r={2.6} fill={C.ink} />
        </>
      ),
    },
    {
      id: 'slika',
      label: 'слика',
      ru: 'картина',
      x: 680,
      y: 130,
      art: (
        <>
          <rect x={-58} y={-44} width={116} height={88} rx={4} fill={C.gold} />
          <rect x={-48} y={-34} width={96} height={68} fill={C.sky} />
          <path d="M-48 34 L-14 -8 L8 18 L26 -2 L48 34 Z" fill={C.greenSoft} />
          <circle cx={22} cy={-16} r={9} fill={C.white} />
        </>
      ),
    },
  ],
};

// --- Сцена: улица ------------------------------------------------------------

const STREET: PalaceScene = {
  id: 'ulica',
  title: 'Улица',
  subtitle: 'Улица',
  backdrop: (
    <>
      <rect width={SCENE_WIDTH} height={430} fill={C.sky} />
      <rect y={430} width={SCENE_WIDTH} height={SCENE_HEIGHT - 430} fill={C.stone} />
      <path d={`M0 470 H ${SCENE_WIDTH}`} stroke="#bdb6a8" strokeWidth={4} />
      <circle cx={880} cy={90} r={44} fill={C.white} opacity={0.75} />
    </>
  ),
  objects: [
    {
      id: 'pekara',
      label: 'пекара',
      ru: 'пекарня',
      x: 170,
      y: 300,
      art: (
        <>
          <rect x={-110} y={-140} width={220} height={280} fill={C.wall} />
          <path d="M-124 -140 L0 -206 L124 -140 Z" fill={C.red} />
          <rect x={-40} y={20} width={80} height={120} rx={4} fill={C.woodDark} />
          <rect x={-92} y={-60} width={66} height={58} rx={4} fill={C.glass} />
          <rect x={26} y={-60} width={66} height={58} rx={4} fill={C.glass} />
          <rect x={-70} y={-108} width={140} height={26} rx={6} fill={C.gold} />
        </>
      ),
    },
    {
      id: 'tramvaj',
      label: 'трамвај',
      ru: 'трамвай',
      x: 690,
      y: 350,
      art: (
        <>
          <rect x={-150} y={-90} width={300} height={140} rx={18} fill={C.redBright} />
          <rect x={-130} y={-72} width={100} height={56} rx={6} fill={C.glass} />
          <rect x={-14} y={-72} width={100} height={56} rx={6} fill={C.glass} />
          <rect x={98} y={-72} width={38} height={56} rx={6} fill={C.glass} />
          <path d="M-40 -90 V-124 H40" stroke={C.ink} strokeWidth={5} fill="none" />
          <circle cx={-90} cy={54} r={22} fill={C.ink} />
          <circle cx={90} cy={54} r={22} fill={C.ink} />
        </>
      ),
    },
    {
      id: 'fenjer',
      label: 'фењер',
      ru: 'фонарь',
      x: 430,
      y: 330,
      art: (
        <>
          <path d="M0 150 V-96" stroke={C.ink} strokeWidth={9} />
          <path d="M-26 -96 H26 L16 -142 H-16 Z" fill={C.gold} />
          <circle cx={0} cy={-152} r={7} fill={C.ink} />
          <ellipse cx={0} cy={152} rx={22} ry={7} fill={C.ink} />
        </>
      ),
    },
    {
      id: 'klupa',
      label: 'клупа',
      ru: 'скамейка',
      x: 300,
      y: 500,
      art: (
        <>
          <rect x={-84} y={-30} width={168} height={12} rx={5} fill={C.wood} />
          <rect x={-84} y={-10} width={168} height={12} rx={5} fill={C.wood} />
          <path d="M-70 2 V38 M70 2 V38" stroke={C.ink} strokeWidth={8} />
          <path d="M-70 -30 V-56 M70 -30 V-56" stroke={C.ink} strokeWidth={8} />
        </>
      ),
    },
    {
      id: 'drvo',
      label: 'дрво',
      ru: 'дерево',
      x: 540,
      y: 400,
      art: <Tree />,
    },
    {
      id: 'kiosk',
      label: 'киоск',
      ru: 'киоск',
      x: 900,
      y: 400,
      art: (
        <>
          <rect x={-64} y={-90} width={128} height={160} rx={8} fill={C.blue} />
          <rect x={-50} y={-72} width={100} height={62} rx={4} fill={C.glass} />
          <rect x={-72} y={-104} width={144} height={20} rx={6} fill={C.gold} />
          <rect x={-24} y={0} width={48} height={70} rx={4} fill={C.blueSoft} />
        </>
      ),
    },
    {
      id: 'cesma',
      label: 'чесма',
      ru: 'колонка',
      x: 120,
      y: 500,
      art: (
        <>
          <rect x={-22} y={-70} width={44} height={110} rx={10} fill="#9a978f" />
          <path d="M-22 -40 H-44" stroke="#9a978f" strokeWidth={8} />
          <ellipse cx={0} cy={44} rx={40} ry={12} fill="#8d8a83" />
          <path d="M-44 -34 C -46 -20 -40 -8 -44 6" stroke={C.blueSoft} strokeWidth={5} fill="none" />
        </>
      ),
    },
    {
      id: 'golub',
      label: 'голуб',
      ru: 'голубь',
      x: 640,
      y: 520,
      art: (
        <>
          <ellipse cx={0} cy={0} rx={30} ry={18} fill="#8fa0b4" />
          <circle cx={22} cy={-16} r={13} fill="#8fa0b4" />
          <path d="M34 -16 L48 -12 L34 -8 Z" fill={C.gold} />
          <path d="M-30 -4 L-52 -14 L-26 -12 Z" fill="#7488a0" />
          <circle cx={26} cy={-18} r={2.4} fill={C.ink} />
        </>
      ),
    },
  ],
};

export const SCENES: PalaceScene[] = [KITCHEN, LIVING, STREET];

export function sceneById(id: string): PalaceScene {
  // Сцена могла исчезнуть между выпусками, а дворец на неё ссылается: показать
  // первую комнату лучше, чем пустой экран без объяснения.
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0]!;
}
