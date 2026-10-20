import { estimateContentHash, signatureState, assertSignaturePng } from './estimate-signature';
const estimate={version:2,currency:'NGN',amount:30,lines:[{type:'PART',referenceId:'p',description:'Part',quantity:1,rate:10,amount:10},{type:'LABOUR',referenceId:'l',description:'Work',quantity:1,rate:20,amount:20}]};
test('canonical hash ignores query ordering and persisted ids',()=>{expect(estimateContentHash({...estimate,lines:[...estimate.lines].reverse()})).toBe(estimateContentHash(estimate));});
test.each(['version','currency','amount'])('changing %s invalidates hash',key=>{expect(estimateContentHash({...estimate,[key]:key==='currency'?'USD':5})).not.toBe(estimateContentHash(estimate));});
test.each(['type','referenceId','description','quantity','rate','amount'])('changing line %s invalidates hash',key=>{const lines=estimate.lines.map(line=>({...line}));Object.assign(lines[0],{[key]:typeof lines[0][key as keyof typeof lines[0]]==='number'?999:'changed'});expect(estimateContentHash({...estimate,lines})).not.toBe(estimateContentHash(estimate));});
test('valid, invalid, legacy and override are distinguished',()=>{
 const signature={estimateVersion:2,totalSigned:30,contentHash:estimateContentHash(estimate)};
 expect(signatureState(estimate,{signatureRequired:true,signature})).toBe('valid');
 expect(signatureState({...estimate,amount:40},{signature})).toBe('invalid');
 expect(signatureState(estimate,{signatureRequired:true})).toBe('invalid');
 expect(signatureState(estimate,{signatureRequired:false})).toBe('legacy');
 expect(signatureState(estimate,{signatureRequired:true,overrideReason:'Verified paper approval'})).toBe('override');
});
test('only bounded PNG signatures are accepted',()=>{expect(()=>assertSignaturePng('data:image/svg+xml;base64,AAAA')).toThrow('PNG');expect(()=>assertSignaturePng('data:image/png;base64,AAAA')).toThrow('64 KiB');});
