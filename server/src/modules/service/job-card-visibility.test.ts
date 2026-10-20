import { scopeJobCard } from './job-card-visibility';
const card = {status:'OPEN',customer:{firstName:'Test'},estimatedCost:100,estimates:[{amount:100,lines:[{rate:50}]}],invoices:[{amount:100}],service:{price:100},complaints:[{description:'Check',spare:100}],labourLines:[{description:'Repair',rate:100,amount:100}],partIssuances:[{sparePart:{partNumber:'P',retailRate:100},returns:[{amount:10}]}]};
test('job-card-only reader receives no financial data at any nesting level',()=>{
 const result=scopeJobCard(card,['jobcard:read']);
 expect(result).toMatchObject({status:'OPEN',customer:{firstName:'Test'}});
 const json=JSON.stringify(result); for(const field of ['estimates','invoices','rate','amount','price','retailRate','estimatedCost','spare']) expect(json).not.toContain('"'+field+'":');
 expect(card.estimates).toHaveLength(1);
});
test('estimate and invoice data require their independent permissions',()=>{
 expect(scopeJobCard(card,['estimate:read'])).not.toHaveProperty('invoices');
 expect(scopeJobCard(card,['invoice:read'])).not.toHaveProperty('estimates');
 expect(scopeJobCard(card,['estimate:read'])).toHaveProperty('estimates');
 expect(scopeJobCard(card,['invoice:read'])).toHaveProperty('invoices');
});
