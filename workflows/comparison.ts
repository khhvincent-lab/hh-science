import {comparisonSide,settleComparison} from '@/lib/comparison/steps';
export async function comparisonWorkflow(id:string){
 'use workflow';
 await Promise.allSettled([comparisonSide(id,'a'),comparisonSide(id,'b')]);
 await settleComparison(id);
}
