import {afterEach,expect,it} from 'vitest';
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
