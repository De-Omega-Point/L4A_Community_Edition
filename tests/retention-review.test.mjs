import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRegistrationRetention } from '../server/registration/retention-review.mjs';
const input={productId:'26a27e03-79eb-4cc7-bb82-c492d57d4302',reviewedBy:'Synthetic reviewer',reason:'Synthetic purpose review',legalHold:false,purposeStillNeeded:false,reviewedAt:'2026-10-28T12:00:00Z',nextReviewAt:'2026-11-28T12:00:00Z'};
test('unneeded record yields approval-required non-executable review, never deletion',()=>{
 assert.equal(reviewRegistrationRetention(input).decision,'approval-required-for-disposal');
 assert.equal(reviewRegistrationRetention(input).executable,false);
 assert.equal(Object.isFrozen(reviewRegistrationRetention(input)),true);
});
test('legal hold and continuing purpose prevent disposal recommendation',()=>{
 for(const change of [{legalHold:true},{purposeStillNeeded:true}]) assert.equal(reviewRegistrationRetention({...input,...change}).decision,'retain-and-review');
});
test('missing decision, exact record, reviewer, reason or valid future review fails closed',()=>{
 for(const change of [{productId:'*'},{reviewedBy:''},{reason:''},{legalHold:undefined},{purposeStillNeeded:null},{reviewedAt:'invalid'},{nextReviewAt:input.reviewedAt}]) assert.throws(()=>reviewRegistrationRetention({...input,...change}));
});
