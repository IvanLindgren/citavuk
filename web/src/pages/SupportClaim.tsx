import { useState } from 'react';
import { claimGuestDonation } from '../api/donations';
import { ApiError } from '../api/client';
import { Button, ButtonLink, Card, ErrorNote } from '../components/ui';
import { clearGuestDonationLink, takeGuestDonationLink } from '../lib/guestDonationLink';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';

export function SupportClaim(){
  useSeo({title:'Привязать поддержку — Читавук',noindex:true});
  const {account,loading,refreshAccount}=useAuth();
  const [token]=useState(takeGuestDonationLink);
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
  async function claim(){
    if(busy||!token)return;setBusy(true);setError('');
    try{await claimGuestDonation({token});clearGuestDonationLink();await refreshAccount();setDone(true);}
    catch(e){setError(e instanceof ApiError?e.message:'Не удалось привязать поддержку, попробуй ещё раз');}
    finally{setBusy(false);}
  }
  return <main className="paper-grain min-h-[70dvh] px-5 py-16"><Card className="mx-auto max-w-xl p-7 sm:p-10">
    <h1 className="text-3xl">{done?'Поддержка в твоём аккаунте':'Привяжи поддержку Читавука'}</h1>
    <p className="mt-4 leading-relaxed text-[var(--text-muted)]">{done?'Спасибо, платёж учтён в профиле и суммируется с твоей прошлой поддержкой':'Войди или создай аккаунт с той же почтой, на которую пришло это письмо'}</p>
    {error&&<div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
    <div className="mt-6 flex flex-wrap gap-3">
      {done?<ButtonLink to="/account">В профиль</ButtonLink>:!token?<p>Открой одноразовую ссылку из письма</p>:loading?<p>Проверяем аккаунт</p>:account?<div className="min-w-0"><p className="mb-4 break-all text-sm">Аккаунт: {account.email}</p><Button disabled={busy} onClick={()=>void claim()}>{busy?'Привязываем':'Привязать к этому аккаунту'}</Button></div>:<>
        <ButtonLink to="/login?next=%2Fsupport%2Fclaim">Войти</ButtonLink>
        <ButtonLink variant="secondary" to="/login?mode=register&next=%2Fsupport%2Fclaim">Создать аккаунт</ButtonLink>
      </>}
    </div>
    {!done&&<div className="mt-6 space-y-2 text-sm text-[var(--text-muted)]"><p>Ссылка действует 3 дня и привязывает оплату только один раз</p><p>Если после регистрации открылась другая страница, снова открой это письмо</p></div>}
  </Card></main>;
}
