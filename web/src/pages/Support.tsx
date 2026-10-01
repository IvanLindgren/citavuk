import { useEffect, useState, type FormEvent } from 'react';
import { LuBadgeCheck, LuBookOpen, LuHeart, LuKeyboard, LuLightbulb, LuShieldCheck, LuUsers } from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  getDonationAvailability,
  getSupporters,
  startDonation,
  type DonationAvailability,
  type Supporter,
  getSupportSubscriptions,
  cancelSupportSubscription,
  type SupportSubscription,
} from '../api/donations';
import { Button, Card, ErrorNote, Reveal } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import { SUPPORT_SELLER } from './supportSeller';
import { GuestDonationPanel } from '../components/GuestDonationPanel';

const PRESETS = [200, 500, 1000] as const;
const MIN_AMOUNT = 50;
const MAX_AMOUNT = 100_000;
const SUPPORTER_THRESHOLD = 200;

const PERKS = [
  {
    icon: LuUsers,
    title: 'Имя среди друзей Читавука',
    text: 'На отдельной странице и на главной — если разрешишь его показывать.',
  },
  {
    icon: LuBadgeCheck,
    title: 'Значок в профиле',
    text: 'Появляется в аккаунте сразу после оплаты. Суммы складываются: две поддержки по 100 ₽ тоже считаются.',
  },
  {
    icon: LuBookOpen,
    title: 'Закрытая библиотека',
    text: 'Книги и подкасты на сербском, которых нет в общей библиотеке. Открываются в читалке со всеми подсказками.',
  },
  {
    icon: LuKeyboard,
    title: 'Новые игры раньше всех',
    text: '«Уничтожь эти падежи» — печатная машинка с лапами Читавука: друзьям сразу, остальным с 12 октября.',
  },
  {
    icon: LuLightbulb,
    title: 'Идея вне очереди',
    text: 'Напиши, чего не хватает в Читавуке, — рассмотрю первой и честно отвечу, получится ли.',
  },
] as const;

export function Support() {
  useSeo({
    title: 'Поддержать Читавук',
    description:
      'Поддержать бесплатное развитие Читавука: сервер, словари, перевод и выход приложений на iOS и macOS. Поддержавшие получают значок и место среди друзей проекта.',
  });

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 py-10 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h1 className="mt-2 text-4xl sm:text-5xl">Поддержать Читавук</h1>
        </Reveal>

        <Reveal delay={0.06}>
          <Card className="mt-8 p-6 sm:p-9">
            <div className="grid items-center gap-7 sm:grid-cols-[1fr_auto]">
              <div className="space-y-4 leading-relaxed">
                <p className="font-display text-2xl font-bold">Привет, друже!</p>
                <p>
                  Читавук бесплатный и таким останется: платить за чтение,
                  курс и словарь не придётся никогда.
                </p>
                <p>
                  Но сервер, перевод, озвучка и выход на iOS и macOS стоят
                  денег. Я делаю Читавук один, и твоя поддержка помогает
                  выпускать новое заметно быстрее.
                </p>
              </div>
              <img
                src="/img/citavuk_zdravo.webp"
                srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x"
                alt=""
                width={180}
                height={180}
                className="mx-auto w-32 object-contain sm:w-40"
              />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <DonationForm />
          <GuestDonationPanel />
        </Reveal>

        <Reveal delay={0.12}>
          <section className="mt-5">
            <h2 className="text-2xl">Что получают друзья Читавука</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              За поддержку от {SUPPORTER_THRESHOLD} ₽ — одной оплатой или несколькими.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PERKS.map(({ icon: Icon, title, text }) => (
                <Card key={title} tone="contour" className="p-5">
                  <Icon className="size-6 text-[var(--accent)]" aria-hidden="true" />
                  <h3 className="mt-3 text-lg leading-snug">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{text}</p>
                </Card>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.14}>
          <SupportersPreview />
        </Reveal>

        <Reveal delay={0.16}>
          <Terms />
        </Reveal>
      </div>
    </main>
  );
}

function DonationForm() {
  const { account } = useAuth();
  const [preset, setPreset] = useState<number | null>(500);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState(account?.displayName ?? '');
  const [showPublic, setShowPublic] = useState(true);
  const [message, setMessage] = useState('');
  const [showAmount, setShowAmount] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const [consent, setConsent] = useState(false);
  const [recoveryEmail,setRecoveryEmail]=useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState<DonationAvailability | null>(null);

  // Доступность зависит от входа: в тестовом режиме платит только администратор.
  useEffect(() => {
    let cancelled = false;
    getDonationAvailability()
      .then((value) => !cancelled && setAvailability(value))
      .catch(() => !cancelled && setAvailability({ available: true, testMode: false }));
    return () => {
      cancelled = true;
    };
  }, [account?.id]);
  const closed = availability !== null && !availability.available;

  // Имя из аккаунта подставляется, когда сессия восстановилась после загрузки.
  const [seenAccount, setSeenAccount] = useState(account?.id);
  if (account?.id !== seenAccount) {
    setSeenAccount(account?.id);
    if (!name && account?.displayName) setName(account.displayName);
  }

  const amount = preset ?? Number.parseInt(custom, 10);
  const valid = Number.isFinite(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const started = await startDonation({
        amountRubles: amount,
        name: name.trim(),
        showPublic: showPublic && name.trim() !== '',
        message: message.trim(),
        showAmount,
        showMessage,
        monthly,
        monthlyConsent: consent,
        recoveryEmail:account?undefined:recoveryEmail.trim(),
      });
      window.location.assign(started.confirmationUrl);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось начать оплату.');
      setBusy(false);
    }
  };

  return (
    <Card className="mt-5 border-[var(--accent)]/35 p-6 sm:p-8">
      <form onSubmit={submit}>
        <h2 className="text-2xl">Сколько поддержать</h2>
        {availability?.monthlyAvailable && <div className="mt-4 flex flex-wrap gap-3">
          <AmountChip active={!monthly} onClick={() => setMonthly(false)}>Один раз</AmountChip>
          <AmountChip active={monthly} onClick={() => setMonthly(true)}>Каждый месяц</AmountChip>
        </div>}
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Сумма">
          {PRESETS.map((value) => (
            <AmountChip
              key={value}
              active={preset === value}
              onClick={() => setPreset(value)}
            >
              {value.toLocaleString('ru-RU')} ₽
            </AmountChip>
          ))}
          <label
            className={[
              'flex min-h-11 items-center gap-1.5 rounded-xl border px-3 transition-colors',
              preset === null
                ? 'border-[var(--accent)] bg-[var(--accent)]/8'
                : 'border-[var(--line)] bg-[var(--bg-raised)]',
            ].join(' ')}
          >
            <span className="sr-only">Своя сумма</span>
            <input
              inputMode="numeric"
              placeholder="Своя сумма"
              value={custom}
              onFocus={() => setPreset(null)}
              onChange={(event) => {
                setPreset(null);
                setCustom(event.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              className="w-28 bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-[var(--text-muted)]"
            />
            <span className="text-[var(--text-muted)]">₽</span>
          </label>
        </div>
        {preset === null && custom !== '' && !valid && (
          <p className="mt-2 text-sm text-[var(--error)]">
            От {MIN_AMOUNT} до {MAX_AMOUNT.toLocaleString('ru-RU')} ₽.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Имя для страницы друзей</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder="Например, Ана из Белграда"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Пара слов разработчику</span>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={300}
              placeholder="Необязательно"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--accent)]"
            />
          </label>
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={showPublic && name.trim() !== ''}
            disabled={name.trim() === ''}
            onChange={(event) => setShowPublic(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            Показать имя среди друзей Читавука
            {name.trim() === '' && (
              <span className="text-[var(--text-muted)]"> — без имени поддержка будет анонимной</span>
            )}
          </span>
        </label>

        {showPublic && name.trim() && <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-start gap-2.5"><input type="checkbox" checked={showAmount} onChange={e => setShowAmount(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />Показывать сумму поддержки на пьедестале и в благодарности дня</label>
          <label className="flex items-start gap-2.5"><input type="checkbox" checked={showMessage} onChange={e => setShowMessage(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />Разрешаю опубликовать сообщение, если моя поддержка станет самой большой за день. Сообщение проверяется перед публикацией.</label>
        </div>}
        {monthly && <div className="mt-5 rounded-xl bg-[var(--bg-sunken)] p-4 text-sm leading-relaxed">
          <p>Первый платёж — сейчас, затем {valid ? `${amount.toLocaleString('ru-RU')} ₽` : 'выбранная сумма'} каждый месяц в то же число по Москве. Если такого числа нет — в последний день месяца. Способ оплаты сохранит ЮKassa. Отмена — здесь, в разделе «Моя ежемесячная поддержка», в любой момент до следующего списания.</p>
          <label className="mt-3 flex items-start gap-2.5"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />Согласен на сохранение способа оплаты и ежемесячное списание указанной суммы</label>
        </div>}

        {!account && availability?.guestLinkAvailable && <label className="mt-5 block">
          <span className="text-sm font-semibold">Почта для привязки на другом устройстве</span>
          <input type="email" value={recoveryEmail} onChange={event=>setRecoveryEmail(event.target.value)} maxLength={254} placeholder="Необязательно" className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3" />
          <span className="mt-2 block text-xs leading-relaxed text-[var(--text-muted)]">После оплаты пришлём одноразовую ссылку, чтобы привязать поддержку к аккаунту с этой почтой</span>
        </label>}
        {!account && (
          <p className="mt-4 rounded-xl bg-[var(--bg-sunken)] px-4 py-3 text-sm leading-relaxed text-[var(--text-muted)]">
            <Link to="/login" className="font-semibold text-[var(--accent)] underline underline-offset-2">
              Войди в аккаунт
            </Link>
           , или оплати гостем и привяжи поддержку после регистрации в этом браузере
            {availability?.guestLinkAvailable && <> Для другого устройства укажи почту выше</>}
          </p>
        )}

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {closed && (
          <p className="mt-4 rounded-xl bg-[var(--warn-soft)] px-4 py-3 text-sm leading-relaxed">
            Оплата временно недоступна. Загляни через пару дней — форма заработает здесь же.
          </p>
        )}
        {availability?.testMode && (
          <p className="mt-4 rounded-xl bg-[var(--warn-soft)] px-4 py-3 text-sm leading-relaxed">
            Тестовый режим магазина: оплата проходит только тестовыми картами
            ЮKassa. Такие платежи не попадают в список друзей и в чеки.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="submit" size="lg" disabled={!valid || busy || closed || (monthly && (!consent || !account))}>
            <LuHeart className="size-5" aria-hidden="true" />
            {busy ? 'Открываю оплату…' : valid ? `Поддержать на ${amount.toLocaleString('ru-RU')} ₽${monthly ? ' в месяц' : ''}` : 'Поддержать'}
          </Button>
          <p className="flex max-w-xs items-start gap-2 text-xs leading-relaxed text-[var(--text-muted)]">
            <LuShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Карты, СБП, T‑Pay, SberPay и ЮMoney — на странице ЮKassa. Данные карты
            Читавук не видит.
          </p>
        </div>
      </form>
      <MonthlySupport />
    </Card>
  );
}

function MonthlySupport() {
  const { account } = useAuth();
  const [items, setItems] = useState<SupportSubscription[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; if (account) void getSupportSubscriptions().then(list => { if (alive) setItems(list); }).catch(() => {}); return () => { alive = false; }; }, [account]);
  const active = items.filter(s => s.status !== 'canceled');
  if (!account || !active.length) return null;
  return <section className="mt-6 border-t border-[var(--line)] pt-5">
    <h3 className="text-xl">Моя ежемесячная поддержка</h3>
    {active.map(s => <div key={s.id} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p>{(s.amountKopecks / 100).toLocaleString('ru-RU')} ₽ в месяц<br /><span className="text-sm text-[var(--text-muted)]">{s.status === 'active' && s.nextChargeAt ? `Следующий платёж: ${new Date(s.nextChargeAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : s.status === 'pending' ? 'Подключится после подтверждения оплаты' : 'Автоплатёж приостановлен'}</span></p>
      <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => { setBusy(s.id); setError(''); void cancelSupportSubscription(s.id).then(() => setItems(list => list.filter(x => x.id !== s.id))).catch(() => setError('Не удалось отменить. Попробуй ещё раз.')).finally(() => setBusy('')); }}>{busy === s.id ? 'Отменяю…' : 'Отключить автоплатёж'}</Button>
    </div>)}
    {error && <ErrorNote>{error}</ErrorNote>}
  </section>;
}

function AmountChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        'min-h-11 rounded-xl border px-4 font-semibold transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment'
          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function SupportersPreview() {
  const [supporters, setSupporters] = useState<Supporter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSupporters()
      .then((list) => !cancelled && setSupporters(list))
      .catch(() => !cancelled && setSupporters([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supporters || supporters.length === 0) return null;

  return (
    <Card tone="flat" className="mt-5 p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">Уже поддержали</h2>
        <Link to="/supporters" className="text-sm font-semibold text-[var(--accent)] underline underline-offset-2">
          Все друзья Читавука
        </Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {supporters.slice(0, 12).map((supporter) => (
          <li
            key={supporter.name + supporter.since}
            className="rounded-full border border-gold/50 bg-[var(--bg-raised)] px-3.5 py-1.5 text-sm font-semibold"
          >
            {supporter.name}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Terms() {
  return (
    <section className="mt-10 border-t border-[var(--line)] pt-6 text-sm leading-relaxed text-[var(--text-muted)]">
      <h2 className="text-base font-bold text-[var(--text)]">Условия</h2>
      <p className="mt-2">
        Поддержка — добровольная оплата от {MIN_AMOUNT} ₽. За сумму от{' '}
        {SUPPORTER_THRESHOLD} ₽ поддержавший получает цифровые бонусы: значок в
        профиле, место на странице друзей проекта, доступ к закрытой библиотеке,
        ранний доступ к новым играм и рассмотрение идеи вне очереди.
        Бонусы появляются сразу после оплаты и действуют бессрочно, пока работает
        Читавук.
      </p>
      <p className="mt-2">
        Вернуть деньги можно в течение 14 дней: напиши на{' '}
        <a href={`mailto:${SUPPORT_SELLER.email}`} className="underline underline-offset-2">
          {SUPPORT_SELLER.email}
        </a>
       , деньги вернутся тем же способом, а бонусы снимутся.
      </p>
      <p className="mt-2">
        Исполнитель: {SUPPORT_SELLER.name}, самозанятый (налог на профессиональный доход)
        {SUPPORT_SELLER.inn && <>, ИНН {SUPPORT_SELLER.inn}</>}. Связь:{' '}
        <a href={`mailto:${SUPPORT_SELLER.email}`} className="underline underline-offset-2">
          {SUPPORT_SELLER.email}
        </a>
       ,{' '}
        <a href="https://t.me/ivanlindgren" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
          Telegram
        </a>
        .
      </p>
    </section>
  );
}
