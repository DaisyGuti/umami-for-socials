import { test as base } from '@playwright/test';
import { createSite, deleteSite, seedEvents, sampleTraffic } from './helpers/api';

export interface SeededSite {
  id: string;
  name: string;
}

interface Fixtures {
  // A fresh site pre-loaded with a realistic spread of traffic + revenue.
  // Created before the test and deleted after (cascade removes its events), so
  // tests never see each other's data and the local D1 doesn't accumulate cruft.
  seededSite: SeededSite;
}

export const test = base.extend<Fixtures>({
  seededSite: async ({ request }, use, testInfo) => {
    // Worker-unique name keeps parallel tests from colliding in the site list.
    const name = `E2E ${testInfo.parallelIndex}-${testInfo.workerIndex} ${testInfo.title}`.slice(0, 60);
    const id = await createSite(request, name);
    await seedEvents(request, id, sampleTraffic());

    await use({ id, name });

    await deleteSite(request, id);
  },
});

export { expect } from '@playwright/test';
