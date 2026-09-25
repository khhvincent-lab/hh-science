import {enqueueComparison} from './server';
export async function queueCompletedComparison(historyId:string){
 'use step';
 try{return await enqueueComparison(historyId,'auto');}catch(error){console.error('Comparison enqueue failed',error instanceof Error?error.message:'database error');return null;}
}
queueCompletedComparison.maxRetries=0;
