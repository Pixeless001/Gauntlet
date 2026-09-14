import { eventSchema, type GauntletEvent } from "../core/events.js";
export function translateEvent(input: unknown): GauntletEvent { return eventSchema.parse(input); }
