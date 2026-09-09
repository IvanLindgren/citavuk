// Измеряет внешние контуры частей атласа для общей SVG/Canvas-маски.
// Само изображение не изменяется; светлые внутренние детали сохраняются.
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
const rig = JSON.parse(await readFile('../frontend/assets/course/mascot_rig.json', 'utf8'));
const png = await readFile(`../frontend/assets/imgs/${rig.atlas}`);
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const outlines = await page.evaluate(async ({ src, parts }) => {
    const img = new Image(); img.src = src; await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    function simplify(points, epsilon) {
      if (points.length < 3) return points;
      const a = points[0], b = points.at(-1);
      let max = 0, index = 0;
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
        const d = Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
        if (d > max) { max = d; index = i; }
      }
      return max > epsilon ? [...simplify(points.slice(0,index+1),epsilon).slice(0,-1), ...simplify(points.slice(index),epsilon)] : [a,b];
    }
    return parts.map(({ rect: [sx,sy,w,h] }) => {
      const pixels = ctx.getImageData(sx,sy,w,h).data;
      const bg = new Uint8Array(w*h), queue = new Int32Array(w*h);
      let head = 0, tail = 0;
      const visit = (x,y) => {
        if (x<0||y<0||x>=w||y>=h) return;
        const p=y*w+x, i=p*4;
        if(bg[p]) return;
        const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        if (Math.min(r,g,b)<190 || Math.max(r,g,b)-Math.min(r,g,b)>16) return;
        bg[p]=1; queue[tail++]=p;
      };
      for(let x=0;x<w;x++){visit(x,0);visit(x,h-1);}
      for(let y=0;y<h;y++){visit(0,y);visit(w-1,y);}
      while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
      // Ориентированные рёбра пикселей; выбираем самый большой замкнутый контур.
      const edges=new Map(), stride=w+1;
      const fg=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&!bg[y*w+x];
      const edge=(x1,y1,x2,y2)=>edges.set(y1*stride+x1,y2*stride+x2);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(fg(x,y)){
        if(!fg(x,y-1))edge(x,y,x+1,y);
        if(!fg(x+1,y))edge(x+1,y,x+1,y+1);
        if(!fg(x,y+1))edge(x+1,y+1,x,y+1);
        if(!fg(x-1,y))edge(x,y+1,x,y);
      }
      let best=[];
      while(edges.size){const start=edges.keys().next().value;let p=start;const path=[];
        while(edges.has(p)){path.push([p%stride,Math.floor(p/stride)]);const next=edges.get(p);edges.delete(p);p=next;if(p===start)break;}
        if(path.length>best.length)best=path;
      }
      if(best.length<10)throw Error('Контур части не найден');
      const mid=Math.floor(best.length/2);
      const clean=[...simplify(best.slice(0,mid+1),0.7).slice(0,-1),...simplify([...best.slice(mid),best[0]],0.7).slice(0,-1)];
      return clean.map(([x,y])=>[Number((x/w*100).toFixed(2)),Number((y/h*100).toFixed(2))]);
    });
  }, {src:`data:image/png;base64,${png.toString('base64')}`,parts:rig.parts});
  console.log(JSON.stringify(outlines));
} finally { await browser.close(); }
