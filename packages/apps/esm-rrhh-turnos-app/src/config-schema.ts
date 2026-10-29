import { Type, validators } from '@openmrs/esm-framework';

import type { TipoFuente } from './api/fuente-datos';

export interface RrhhTurnosConfig {
  fuenteDatos: TipoFuente;
  frappeUrl: string;
  demoTrabajadorId: string;
  ipress: { codigo: string; nombre: string; red: string };
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
  ipress: {
    _type: Type.Object,
    _description: 'Health facility (IPRESS) data printed in the TuASUSALUD template and reports.',
    _default: { codigo: '00000066', nombre: 'HOSPITAL II-1 SANTA CLOTILDE', red: 'MAYNAS PERIFERIE' },
    codigo: { _type: Type.String, _description: 'RENIPRESS code' },
    nombre: { _type: Type.String, _description: 'Facility name' },
    red: { _type: Type.String, _description: 'Health network' },
  },
};
