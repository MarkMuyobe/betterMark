import { Facet } from '../enums/Facet.js';

export interface ICoachAgent {
    id: string;
    facet: Facet;
    name: string;
    personalityProfile?: string; // Configuration for the agent's tone
}
