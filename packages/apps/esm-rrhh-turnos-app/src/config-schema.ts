import { Type, validators } from '@openmrs/esm-framework';

import type { TipoFuente } from './api/fuente-datos';

export interface RrhhTurnosConfig {
  fuenteDatos: TipoFuente;
  frappeUrl: string;
  demoTrabajadorId: string;
}

export const configSchema = {
  fuenteDatos: {
    _type: Type.String,
    _default: 'demo',
    _description:
      'Origin of shifts and clock-in records: "demo" (synthetic data generated in the browser) or "frappe" (Frappe HR REST API).',
    _validators: [validators.oneOf(['demo', 'frappe'])],
  },
  frappeUrl: {
    _type: Type.String,
    _default: '/rrhh',
    _description: 'Base URL of Frappe HR as published by the SIH SALUS gateway (without the trailing /api).',
  },
  demoTrabajadorId: {
    _type: Type.String,
    _default: 'HSC-0004',
    _description: 'Worker shown in "My shifts" with the demo data source when the user is not linked to a worker.',
  },
};
