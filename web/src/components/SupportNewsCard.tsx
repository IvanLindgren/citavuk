import { LuArrowUpRight, LuHeart } from 'react-icons/lu';
import { Link } from '../lib/router';
import './support-news-card.css';

export const SUPPORT_NEWS_COPY = {
  greeting: 'Привет, друже',
  title: 'Помоги Читавуку расти',
  body: 'Я делаю Читавук один и хочу, чтобы учить сербский было проще и интереснее',
  invitation: 'Твоя поддержка помогает оплачивать сервер, перевод и озвучку, исправлять ошибки и выпускать новые возможности',
  action: 'Поддержать Читавук',
  note: 'Чтение, курс и словарь остаются бесплатными',
} as const;

/** Новость на главной, не навязчивый баннер поверх других разделов. */
export function SupportNewsCard() {
  return <article className="support-news-card" aria-labelledby="support-news-title">
    <div className="support-news-art" aria-hidden="true">
      <span className="support-news-halo" />
      <LuHeart className="support-news-heart" />
      <img src="/img/citavuk_zdravo.webp" srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x" width={240} height={240} loading="lazy" alt="" />
    </div>
    <div className="support-news-letter">
      <p className="support-news-greeting">{SUPPORT_NEWS_COPY.greeting}</p>
      <h2 id="support-news-title">{SUPPORT_NEWS_COPY.title}</h2>
      <p>{SUPPORT_NEWS_COPY.body}</p>
      <p>{SUPPORT_NEWS_COPY.invitation}</p>
      <Link to="/support" className="support-news-action">{SUPPORT_NEWS_COPY.action}<LuArrowUpRight aria-hidden="true" /></Link>
      <p className="support-news-note">{SUPPORT_NEWS_COPY.note}</p>
    </div>
  </article>;
}
