import {afterEach,expect,it,vi} from 'vitest';
import {claimGuestDonation,getGuestDonations,startDonation} from './donations';
afterEach(()=>vi.unstubAllGlobals());
it('includes the private guest cookie on guest checkout and lookup',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'1',confirmationUrl:'https://yookassa.ru'}))).mockResolvedValueOnce(new Response(JSON.stringify({items:[]})));
 vi.stubGlobal('fetch',fetch);await startDonation({amountRubles:200,name:'Друг',showPublic:true,message:'',recoveryEmail:'a@example.com'});await getGuestDonations();
 expect(fetch.mock.calls[0]![1].credentials).toBe('include');expect(fetch.mock.calls[1]![1].credentials).toBe('include');
 expect(JSON.parse(fetch.mock.calls[0]![1].body).recoveryEmail).toBe('a@example.com');
});
it('sends the email proof in a POST body, never the URL',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'1'})));vi.stubGlobal('fetch',fetch);
 const token='ctv_'+'a'.repeat(43);await claimGuestDonation({token});
 expect(fetch.mock.calls[0]![0]).not.toContain(token);expect(JSON.parse(fetch.mock.calls[0]![1].body).token).toBe(token);
});
