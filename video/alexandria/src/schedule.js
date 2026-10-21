// Edit decision list: which shot is on screen when, and how it arrives.
import { createVault } from './shots/vault.js';

export const FACTORIES = {
  vault: createVault,
};

export async function registerShots() {
  const mods = await Promise.allSettled([
    import('./shots/library.js').then((m) => (FACTORIES.library = m.createLibrary)),
    import('./shots/eras.js').then((m) => (FACTORIES.eras = m.createEras)),
    import('./shots/table.js').then((m) => (FACTORIES.table = m.createTable)),
    import('./shots/city.js').then((m) => (FACTORIES.city = m.createCity)),
    import('./shots/atrium.js').then((m) => (FACTORIES.atrium = m.createAtrium)),
  ]);
  mods.forEach((r) => r.status === 'rejected' && console.warn('shot module missing:', r.reason && r.reason.message));
}

export const SCHEDULE = [
  { shot: 'vault', t0: 0.0, t1: 3.27 },
  { shot: 'library', t0: 2.95, t1: 7.32, in: { mode: 'wave', dur: 0.32, center: [0.5, 0.52] } },
  { shot: 'eras', param: 0, t0: 7.02, t1: 8.3, in: { mode: 'fade', dur: 0.3 } },
  { shot: 'eras', param: 1, t0: 8.08, t1: 9.38, in: { mode: 'whip', dur: 0.24 } },
  { shot: 'eras', param: 2, t0: 9.16, t1: 10.46, in: { mode: 'whip', dur: 0.24 } },
  { shot: 'eras', param: 3, t0: 10.24, t1: 11.47, in: { mode: 'whip', dur: 0.24 } },
  { shot: 'table', t0: 11.17, t1: 16.32, in: { mode: 'fade', dur: 0.3 } },
  { shot: 'city', param: 'day', t0: 16.0, t1: 24.42, in: { mode: 'flash', dur: 0.32 } },
  { shot: 'atrium', param: 'atrium', t0: 24.05, t1: 26.47, in: { mode: 'dip', dur: 0.4 } },
  { shot: 'city', param: 'night', t0: 26.1, t1: 28.02, in: { mode: 'fade', dur: 0.36 } },
  { shot: 'atrium', param: 'final', t0: 27.65, t1: 30.05, in: { mode: 'fade', dur: 0.36 } },
];
