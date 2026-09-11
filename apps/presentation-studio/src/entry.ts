import { getSurfaceDescriptor, CLIENT_RUNTIME_BUDGETS } from '@classroom/surfaces';
import type { PresentationEngineAdapter } from '@classroom/presentation';
export const surface = getSurfaceDescriptor('authoring-studio');
export const runtimeBudget = CLIENT_RUNTIME_BUDGETS['authoring-studio'];
export interface StudioBootstrap {
    engine: PresentationEngineAdapter;
}

