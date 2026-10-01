import { useEffect, useState } from 'react';
import { claimGuestDonation, emailGuestDonation, formatRubles, getGuestDonations, type GuestDonation } from '../api/donations';
import { ApiError } from '../api/client';
import { useAuth } from '../state/auth';
import { Button, ButtonLink, Card, ErrorNote } from './ui';

export function GuestDonationPanel({donationId,onClaimed}:{donationId?:string;onClaimed?:()=>void}){
  const {account,refreshAccount}=useAuth();
  const [items,setItems]=useState<GuestDonation[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[note,setNote]=useState('');
  const [email,setEmail]=useState('');
  useEffect(()=>{let current=true;void getGuestDonations().then(items=>{if(current)setItems(items.filter(d=>d.status==='succeeded'&&(!donationId||d.id===donationId)));}).catch(()=>{});return()=>{current=false;};},[account?.id,donationId]);
  const next=donationId?`/support/thanks?d=${donationId}`:'/support';
  async function claim(id:string){setBusy(id);setError('');try{await claimGuestDonation({id});await refreshAccount();setItems(items=>items.filter(d=>d.id!==id));onClaimed?.();}catch(e){setError(e instanceof ApiError?e.message:'Не удалось привязать поддержку');}finally{setBusy('');}}
  async function send(d:GuestDonation){setBusy(d.id);setError('');try{await emailGuestDonation(d.id,email.trim()||undefined);setNote('Отправим письмо в ближайшие минуты Проверь также папку «Спам»');}catch(e){setError(e instanceof ApiError?e.message:'Не удалось отправить письмо');}finally{setBusy('');}}
  if(!items.length)return null;
  return <Card className="mt-6 border-[var(--accent)]/30 p-6 text-left">
    <h2 className="text-2xl">Гостевая поддержка</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Привяжи оплату к аккаунту, чтобы получить статус и суммировать все поддержки</p>
    {error&&<div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}{note&&<p role="status" className="mt-4 text-sm">{note}</p>}
    {items.map(d=><div key={d.id} className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="font-semibold">Поддержка на {formatRubles(d.amountKopecks)}</p>
      {account?<Button className="mt-3" disabled={!!busy} onClick={()=>void claim(d.id)}>Привязать к моему аккаунту</Button>:<div className="mt-3 flex flex-wrap gap-3"><ButtonLink to={`/login?next=${encodeURIComponent(next)}`}>Войти</ButtonLink><ButtonLink variant="secondary" to={`/login?mode=register&next=${encodeURIComponent(next)}`}>Создать аккаунт</ButtonLink></div>}
      <p className="mt-4 text-sm text-[var(--text-muted)]">{d.emailSent?'Ссылка для другого устройства отправлена на указанную при оплате почту':d.hasRecoveryEmail?'Ссылка для другого устройства придёт на указанную при оплате почту':'Для другого устройства можно отправить одноразовую ссылку на почту'}</p>
      <label className="mt-3 block text-sm">Почта<input type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder={d.hasRecoveryEmail?'Оставь пустым для прежней почты':'Твоя почта'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2" /></label>
      <Button variant="secondary" size="sm" className="mt-3" disabled={!!busy||(!d.hasRecoveryEmail&&!email.trim())} onClick={()=>void send(d)}>{d.emailSent?'Отправить ссылку снова':'Отправить ссылку'}</Button>
    </div>)}
  </Card>;
}
