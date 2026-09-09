/** Скачанные SVG Lorc, CC BY 3.0; атрибуция доступна внизу урока. */
export function LessonArt({ name, className = '' }: {
  name: 'cog' | 'clockwork' | 'crossed-swords' | 'visored-helm' | 'quill-ink' | 'open-book';
  className?: string;
}) {
  const url = `url('/personal/lesson-art/${name}.svg')`;
  return <span aria-hidden="true" className={`lesson-art ${className}`} style={{ maskImage: url, WebkitMaskImage: url }} />;
}

export function LessonEmblem() {
  return <div className="lesson-emblem" aria-hidden="true">
    <LessonArt name="clockwork" className="lesson-emblem-clock" />
    <LessonArt name="crossed-swords" className="lesson-emblem-swords" />
    <div className="lesson-emblem-shield">
      <img src="/personal/decor/engraved-frame.png" alt="" />
      <LessonArt name="visored-helm" className="lesson-emblem-helm" />
      <img className="lesson-emblem-rosette" src="/personal/decor/ravanica-medallion.png" alt="" />
    </div>
    <LessonArt name="cog" className="lesson-emblem-cog" />
  </div>;
}
