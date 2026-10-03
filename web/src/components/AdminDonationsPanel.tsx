import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client';
import {
  addManualDonation,
  formatRubles,
  getAdminDonations,
  moderateDonationMessage,
  type AdminDonationsMonth,
} from '../api/donations';
import { Button, ErrorNote, Spinner } from './ui';
import { donationMessageModeration } from '../lib/donationModeration';
import { uiLocale } from '../lib/i18n';

const inputClass =
  'min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const DATE_TIME = new Intl.DateTimeFormat(uiLocale(), {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/**
 * Платежи месяца: по этому списку до 9-го числа следующего месяца пробиваются
 * чеки в «Мой налог». Возвращённые показаны отдельно — их чеки аннулируются.
 */
export function AdminDonationsPanel() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<AdminDonationsMonth | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getAdminDonations(month));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить платежи.');
    }
  }, [month]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl">Платежи за месяц</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Чек на каждый платёж — в «Мой налог» до 9-го числа следующего месяца.
            </p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(event) => event.target.value && setMonth(event.target.value)}
            className={inputClass}
            aria-label="Месяц"
          />
        </div>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {!data && !error && (
          <div className="flex min-h-32 items-center justify-center"><Spinner className="size-6" /></div>
        )}
        {data && (
          <>
            {!data.paymentEnabled && (
              <p className="mt-4 rounded-xl bg-[var(--warn-soft)] px-4 py-3 text-sm">
                Ключи ЮKassa на сервере не заданы — форма оплаты на сайте выключена.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <span>Получено: <b>{formatRubles(data.paidKopecks)}</b></span>
              <span>Возвращено: <b>{formatRubles(data.refundKopecks)}</b></span>
              <span>Платежей: <b>{data.donations.length}</b></span>
            </div>
            {data.donations.length === 0 ? (
              <p className="mt-4 text-[var(--text-muted)]">В этом месяце платежей нет.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-[var(--bg-sunken)] text-xs uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-2.5">Когда</th>
                      <th className="px-4 py-2.5">Сумма</th>
                      <th className="px-4 py-2.5">Кто</th>
                      <th className="px-4 py-2.5">Сообщение</th>
                      <th className="px-4 py-2.5">Источник</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.donations.map((d) => (
                      <tr key={d.id} className="border-t border-[var(--line)]">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {d.paidAt ? DATE_TIME.format(new Date(d.paidAt)) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                          {formatRubles(d.amountKopecks)}
                          {d.isTest && (
                            <span className="ml-2 rounded bg-[var(--warn-soft)] px-1.5 py-0.5 text-xs text-[var(--warn)]">
                              тест
                            </span>
                          )}
                          {d.status === 'refunded' && (
                            <span className="ml-2 rounded bg-[var(--error-soft)] px-1.5 py-0.5 text-xs text-[var(--error)]">
                              возврат
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {d.publicName || <span className="text-[var(--text-muted)]">аноним</span>}
                          {!d.showPublic && d.publicName && (
                            <span className="ml-1 text-xs text-[var(--text-muted)]">(скрыт)</span>
                          )}
                          {d.userEmail && (
                            <span className="block text-xs text-[var(--text-muted)]">{d.userEmail}</span>
                          )}
                        </td>
                        <td className="max-w-xs px-4 py-2.5 text-[var(--text-muted)]">
                          <p className="break-words">{d.message}</p>
                          <p className="mt-2 text-xs text-[var(--text)]">{donationMessageModeration(d).label}</p>
                          {donationMessageModeration(d).canModerate && <button type="button" className="mt-2 text-xs font-semibold text-[var(--accent)]" onClick={() => {
                            void moderateDonationMessage(d.id, !d.messageApproved).then(load).catch(() => setError('Не удалось обновить сообщение.'));
                          }}>{d.messageApproved ? 'Снять с публикации' : 'Разрешить публикацию'}</button>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--text-muted)]">
                          {d.source === 'manual' ? 'вручную' : d.providerPaymentId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <ManualDonationForm onAdded={load} />
    </div>
  );
}

function ManualDonationForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [showPublic, setShowPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rubles = Number.parseInt(amount, 10);
    if (!Number.isFinite(rubles) || rubles <= 0) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      await addManualDonation({ email: email.trim(), amountRubles: rubles, name: name.trim(), showPublic });
      setNote('Внесено. Значок и место в списке появятся сразу, если сумма аккаунта от 200 ₽.');
      setEmail('');
      setAmount('');
      setName('');
      await onAdded();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-[var(--line)] pt-8">
      <h2 className="text-2xl">Внести вручную</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Для поддержки, пришедшей мимо ЮKassa: старый сбор ЮMoney, перевод на карту.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className={inputClass} type="email" placeholder="Почта аккаунта (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputClass} inputMode="numeric" placeholder="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required />
        <input className={inputClass} placeholder="Имя для страницы друзей" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showPublic} onChange={(e) => setShowPublic(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Показывать имя
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy || !amount}>
            {busy ? 'Сохраняю…' : 'Внести'}
          </Button>
        </div>
      </form>
      {note && <p className="mt-3 text-sm text-[var(--success)]">{note}</p>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </section>
  );
}
