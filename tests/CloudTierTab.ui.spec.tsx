import React from 'react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { fixture } from './fixtures';
const m=vi.hoisted(()=>({access:vi.fn(),versions:vi.fn(),list:vi.fn(),download:vi.fn(),ratings:vi.fn(),prepare:vi.fn(),upload:vi.fn(),onAuth:vi.fn()}));
vi.mock('../src/integrations/supabase/client',()=>({getSupabase:()=>({auth:{onAuthStateChange:m.onAuth}})}));
vi.mock('../src/utils/supabaseTier',async(importOriginal)=>({...await importOriginal<typeof import('../src/utils/supabaseTier')>(),
  cloudEndpointSummary:()=>({url:'https://project.supabase.co',source:'env'}),cloudAccess:m.access,fetchCloudVersions:m.versions,
  fetchCloudSeasonList:m.list,fetchCloudSeasonData:m.download,fetchCloudRatingSnapshot:m.ratings,prepareIngestRequest:m.prepare,ingestSeasonsToCloud:m.upload}));
import { CloudTierTab } from '../src/components/winmix/ops/CloudTierTab';
const id='10000000-0000-4000-8000-000000000001';
beforeEach(()=>{
  m.access.mockResolvedValue({canWrite:false,contract:2});m.versions.mockResolvedValue([{id,versionKey:'test',status:'sealed',isCurrent:true,revision:1,seasonCount:1,matchCount:240}]);
  m.onAuth.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
const ready=()=>waitFor(()=>expect((screen.getByText('Szezonok letöltése a felhőből') as HTMLButtonElement).disabled).toBe(false));
it('anonymous users can read but upload stays disabled',async()=>{
  render(<CloudTierTab league="angol" seasons={fixture().seasons}/>);await ready();
  expect((screen.getByText('Szezonok feltöltése a felhőbe') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByText('SQL értékelés betöltése') as HTMLButtonElement).disabled).toBe(false);
});
it('uncertain upload retry uses the frozen original request',async()=>{
  const p=fixture();m.access.mockResolvedValue({canWrite:true});m.prepare.mockResolvedValue(p);m.upload.mockRejectedValueOnce(new Error('Időtúllépés')).mockResolvedValueOnce({dataVersionId:id,seasons:1,matches:240});
  const {rerender}=render(<CloudTierTab league="angol" seasons={p.seasons}/>);await ready();
  fireEvent.click(screen.getByText('Szezonok feltöltése a felhőbe'));await screen.findByRole('alert');
  rerender(<CloudTierTab league="angol" seasons={[]}/>);fireEvent.click(screen.getByText('Ugyanazon feltöltés újrapróbálása'));
  await waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(2));expect(m.upload.mock.calls[1][0]).toBe(p);expect(m.prepare).toHaveBeenCalledTimes(1);
});
it('partial download failure never exposes local import',async()=>{
  m.list.mockResolvedValue([{id:'one'},{id:'two'}]);m.download.mockResolvedValueOnce({meta:{id:'one'},matches:[],csvText:''}).mockRejectedValueOnce(new Error('Network error'));
  const onImport=vi.fn();render(<CloudTierTab league="angol" onImport={onImport}/>);await ready();fireEvent.click(screen.getByText('Szezonok letöltése a felhőből'));
  await screen.findByRole('alert');expect(onImport).not.toHaveBeenCalled();expect(screen.queryByText('Letöltött szezonok átvétele')).toBeNull();
});
it('late ratings from another league are discarded',async()=>{
  let resolve!:(x:unknown)=>void;m.ratings.mockReturnValue(new Promise(r=>{resolve=r;}));
  const {rerender}=render(<CloudTierTab league="angol"/>);await ready();fireEvent.click(screen.getByText('SQL értékelés betöltése'));
  rerender(<CloudTierTab league="spanyol"/>);resolve({dataVersionId:id,revision:1,league:'angol',ratings:[{canonicalKey:'wrong',displayName:'Wrong league',netHome:1,netAway:1,ppg:1,autoWeightIndex:5}],basis:[]});
  await waitFor(()=>expect(screen.queryByText('SQL értékelés betöltése…')).toBeNull());expect(screen.queryByText('Wrong league')).toBeNull();
});
