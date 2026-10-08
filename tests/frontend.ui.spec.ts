import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({sessionToken:vi.fn()}));
vi.mock('../src/integrations/supabase/client',()=>({sessionToken:mocks.sessionToken,getSupabase:vi.fn()}));
import { cloudRequest,ingestSeasonsToCloud } from '../src/utils/supabaseTier';
import { fixture } from './fixtures';
beforeEach(()=>{vi.stubEnv('VITE_SUPABASE_URL','https://project.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');mocks.sessionToken.mockResolvedValue(null);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
it('public reads always carry apikey and never use opaque key as bearer',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetch);
  await cloudRequest('rest/v1/rpc/probe',{});expect(fetch.mock.calls[0][1].headers.apikey).toBe('sb_publishable_test');expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
});
it('signed-in calls keep public apikey and use the user token as bearer',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetch);mocks.sessionToken.mockResolvedValue('user.jwt.signature');
  await cloudRequest('functions/v1/winmix-ingest',{},true);expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer user.jwt.signature');expect(fetch.mock.calls[0][1].headers.apikey).toBe('sb_publishable_test');
});
it('sign-in failure stops upload before fetch; HTTP 207 is never a successful ingest',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mocks.sessionToken.mockRejectedValue(new Error('Sign in required'));
  await expect(ingestSeasonsToCloud(fixture())).rejects.toThrow('Sign in required');expect(fetch).not.toHaveBeenCalled();
  mocks.sessionToken.mockResolvedValue('user.jwt.signature');fetch.mockResolvedValue(Response.json({success:true},{status:207}));
  await expect(ingestSeasonsToCloud(fixture())).rejects.toThrow('részleges');
});
it('network failure remains uncertain and JSON shape errors never become success',async()=>{
  const fetch=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));vi.stubGlobal('fetch',fetch);
  await expect(cloudRequest('functions/v1/winmix-ingest',{})).rejects.toThrow('CORS');
  mocks.sessionToken.mockResolvedValue('user.jwt.signature');fetch.mockResolvedValue(Response.json({success:true}));
  await expect(ingestSeasonsToCloud(fixture())).rejects.toThrow();
});
