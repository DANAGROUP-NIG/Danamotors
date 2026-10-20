import { planEstimateRevision } from './estimate-revision';
const source={id:'old',version:2,description:'Old',amount:10,lines:[{amount:10}]};
const next={description:'New',amount:20,lines:[{amount:20}]};
test('revision links N+1 and preserves an auditable before/after',()=>{
 expect(planEstimateRevision(source,'old',next)).toEqual({version:3,supersedesId:'old',diff:{before:{description:'Old',amount:10,lines:source.lines},after:next}});
 expect(source.amount).toBe(10);
});
test('create cannot replace an estimate and revision requires latest source',()=>{
 expect(()=>planEstimateRevision(source,undefined,next)).toThrow('revise');
 expect(()=>planEstimateRevision(source,'stale',next)).toThrow('latest');
 expect(()=>planEstimateRevision(undefined,'missing',next)).toThrow('latest');
 expect(planEstimateRevision(undefined,undefined,next).version).toBe(1);
});
