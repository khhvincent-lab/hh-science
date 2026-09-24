import {AsyncLocalStorage} from 'node:async_hooks';
import type {AISolverSettings} from './ai-settings';
export const solveJobContext=new AsyncLocalStorage<{settings:AISolverSettings;onStage:(stage:string)=>Promise<void>}>();
