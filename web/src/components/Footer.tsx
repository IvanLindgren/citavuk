import { LuBookOpen, LuCompass, LuExternalLink, LuGraduationCap, LuHeart, LuLibraryBig, LuSend, LuDownload, LuFilm } from 'react-icons/lu';
import { Link } from '../lib/router';
import './footer.css';

const COLUMNS = [
  { title: 'Читать и слушать', icon: LuBookOpen, links: [
    ['/library', 'Моя библиотека'], ['/public-library', 'Книги для всех'],
    ['/books', 'Что почитать'], ['/listening', 'Слушание'], ['/vukotok', 'Вукоток'],
  ] },
  { title: 'Учиться', icon: LuGraduationCap, links: [
    ['/personal', 'Колода сербского'], ['/course', 'Курс грамматики'],
    ['/roadmap', 'Дорожная карта'], ['/trainer', 'Тренажёрка'], ['/cards', 'Мой словарь'],
  ] },
  { title: 'Открывать', icon: LuCompass, links: [
    ['/putovanje', 'Путешествие по Сербии'], ['/basta', 'Сад Читавука'],
    ['/palace', 'Дворец памяти'], ['/dialogues', 'Игровые диалоги'], ['/vukotok/video', 'Короткие видео'],
  ] },
  { title: 'Материалы', icon: LuLibraryBig, links: [
    ['/materials', 'Для поступления'], ['/materials?level=gimnazija', 'Приём в гимназию'],
    ['/materials?level=fakultet', 'Вступительные на факультет'], ['/exams', 'Экзамены'], ['/lessons', 'Уроки преподавателей'],
  ] },
  { title: 'О Читавуке', icon: LuHeart, links: [
    ['/about', 'О проекте'], ['/support', 'Поддержать развитие'],
    ['/teachers', 'Для учителей'], ['/account', 'Мой аккаунт'], ['/downloads', 'Приложения'],
  ] },
] as const;

/** Компактная карта сайта: равные группы, отдельная строка контактов и права. */
export function Footer() {
  return <footer className="site-footer">
    <div className="site-footer-inner">
      <div className="site-footer-welcome">
        <div className="site-footer-intro">
          <Link to="/" className="site-footer-brand">
            <img src="/img/citavuk_icon.webp" srcSet="/img/citavuk_icon.webp 1x, /img/citavuk_icon@2x.webp 2x" width={44} height={44} alt="" />
            <span>Читавук</span>
          </Link>
          <p className="site-footer-headline">Ещё одна страница.<br /><em>И Сербия чуть ближе.</em></p>
          <p className="site-footer-caption">Выбирай историю, собирай слова и возвращайся за новым открытием.</p>
          <Link to="/downloads" className="site-footer-download"><LuDownload aria-hidden /> Возьми Читавука с собой</Link>
        </div>
        <div className="site-footer-scene">
          <div className="site-footer-postcards">
            <Link to="/public-library" className="footer-postcard footer-postcard-book" aria-label="Открыть публичную библиотеку">
              <img src="/personal/decor/ravanica-medallion.png" alt="" loading="lazy" />
              <span>Истории<br /><b>ждут тебя</b></span>
            </Link>
            <Link to="/personal" className="footer-postcard footer-postcard-deck" aria-label="Открыть колоду сербского">
              <img className="footer-card-art" src="/personal/months/09.webp" alt="" loading="lazy" />
              <img className="footer-card-frame" src="/personal/decor/engraved-frame.png" alt="" loading="lazy" />
              <span>Твоя колода<br /><b>сербского</b></span>
            </Link>
          </div>
          <img className="site-footer-wolf" src="/img/citavuk_zdravo.webp" srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x" alt="Читавук машет тебе лапой" loading="lazy" width={240} height={240} />
          <span className="footer-scene-note">До новой встречи!</span>
        </div>
      </div>
      <div className="site-footer-columns">
        {COLUMNS.map(({title, icon: Icon, links}) => <nav key={title} aria-label={`Внизу страницы: ${title}`}>
          <h2><Icon aria-hidden />{title}</h2>
          <ul>{links.map(([to,label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul>
        </nav>)}
      </div>
      <div className="site-footer-community">
        <div>
          <a href="https://t.me/citavuk" target="_blank" rel="noreferrer noopener"><LuSend aria-hidden /> Наш Telegram <LuExternalLink aria-hidden /></a>
          <a href="https://serbiansubtitles.online/" target="_blank" rel="noreferrer noopener"><LuFilm aria-hidden /> Кино с субтитрами <LuExternalLink aria-hidden /></a>
        </div>
        <span>Есть идея? <a href="https://t.me/ivanlindgren" target="_blank" rel="noreferrer noopener">Напиши Денису</a></span>
      </div>
      <div className="site-footer-legal">
        <span>© {new Date().getFullYear()} Читавук <span className="site-footer-credit"> / Денис Корнилов</span></span>
        <div><Link to="/privacy">Конфиденциальность</Link><a href="https://vk.com/denkorni" target="_blank" rel="noreferrer noopener">Связаться в VK</a></div>
      </div>
      <p className="site-footer-sources">Материалы для поступления сопровождаются ссылками на первоисточники сербских учебных заведений.</p>
    </div>
  </footer>;
}
