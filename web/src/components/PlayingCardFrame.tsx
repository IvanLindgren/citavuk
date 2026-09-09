/** Подготовленные иллюстратором/автором SVG преобразованы в общие лёгкие спрайты. */
export function PlayingCardFrame({back=false}:{back?:boolean}) {
 return <>
  {back&&<img className="playing-medallion" src="/personal/decor/ravanica-medallion.png" alt="" loading="lazy" decoding="async"/>}
  <img className="playing-card-frame" src="/personal/decor/engraved-frame.png" alt="" loading="lazy" decoding="async"/>
 </>;
}
export const lessonSuit=(kind?:string)=>({reading:'♠',grammar:'♣',vocabulary:'♦',listening:'♥',writing:'♠'}[kind??'']??'♦');
