// Guided paths live in data/seed/journeys.json so they can be added without touching
// React code. scripts/validate_dataset.py checks every path in CI: each step exists,
// consecutive steps share an edge, and no step repeats.
import data from "../../../data/seed/journeys.json";

export interface JourneyStep { id: string; caption: string }
export interface Journey { title: string; steps: JourneyStep[] }

export const JOURNEYS: Journey[] = data;
