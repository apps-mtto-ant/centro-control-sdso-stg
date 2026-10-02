// v0.2.0-dev-r3: el rol del frontend solo controla presentación futura.
// La autorización real deberá validarse siempre en el backend (Apps Script).
const ROLE = 'LECTOR';

export const auth = Object.freeze({
  get role() { return ROLE; },
  can(action) {
    if (action === 'consultar') return true;
    return false;
  }
});
