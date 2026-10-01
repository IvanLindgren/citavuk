import {afterEach,expect,it,vi} from 'vitest';
import {clearGuestDonationLink,takeGuestDonationLink} from './guestDonationLink';
afterEach(()=>{clearGuestDonationLink();sessionStorage.clear();history.replaceState(null,'','/');});
it('keeps a link across login without putting its secret in a query',()=>{
 const token='ctv_'+'a'.repeat(43);history.replaceState({test:true},'',`/support/claim#token=${token}`);
 expect(takeGuestDonationLink()).toBe(token);expect(location.hash).toBe('');expect(location.search).toBe('');
 history.replaceState(null,'','/login?next=%2Fsupport%2Fclaim');expect(takeGuestDonationLink()).toBe(token);
 clearGuestDonationLink();expect(takeGuestDonationLink()).toBe('');
});

it('rejects a malformed new link instead of reusing an older proof',()=>{
 const token='ctv_'+'a'.repeat(43);history.replaceState(null,'',`/support/claim#token=${token}`);
 expect(takeGuestDonationLink()).toBe(token);
 history.replaceState(null,'','/support/claim#token=bad');
 expect(takeGuestDonationLink()).toBe('');expect(sessionStorage.getItem('citavuk-donation-claim-link')).toBeNull();
});

it('uses the newest link when a private browser refuses storage writes',()=>{
 const old='ctv_'+'a'.repeat(43),fresh='ctv_'+'b'.repeat(43);
 history.replaceState(null,'',`/support/claim#token=${old}`);expect(takeGuestDonationLink()).toBe(old);
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Blocked','QuotaExceededError');});
 try{
  history.replaceState(null,'',`/support/claim#token=${fresh}`);
  expect(takeGuestDonationLink()).toBe(fresh);
  history.replaceState(null,'','/login');expect(takeGuestDonationLink()).toBe(fresh);
 }finally{spy.mockRestore();}
});
