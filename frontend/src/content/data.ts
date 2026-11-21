// The curated content layers, as one lazily loaded chunk. Import this module only from
// content.ts (dynamically) or from tests: a static import from app code would pull every
// guided path, role and famous app back into the entry bundle.
import journeys from "../../../data/seed/journeys.json";
import roles from "../../../data/seed/roles.json";
import apps from "../../../data/seed/apps.json";
import type { Journey } from "../graph/journeys";
import type { Role } from "../graph/roles";
import type { FamousApp } from "../graph/apps";

export const JOURNEYS: Journey[] = journeys;
export const ROLES: Role[] = roles;
export const APPS: FamousApp[] = apps as FamousApp[];
