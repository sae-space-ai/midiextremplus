/**
 * Orchestral Order Engine
 *
 * Ordena instrumentos según plantilla orquestal estándar.
 * Configurable para diferentes tipos de ensamble.
 */

import { ScoreInstrument, OrchestralOrderConfig, EnsembleTemplate } from './types';
import { InstrumentLayer } from '../mmc/types';

// ============================================================
// PLANTILLAS ORQUESTALES
// ============================================================

const SYMPHONIC_ORCHESTRA_CONFIG: OrchestralOrderConfig = {
  template: 'symphonic_orchestra',
  groups: [
    {
      name: 'Woodwinds',
      bracket_type: 'bracket',
      families: ['Madera', 'Woodwind'],
      order: 1,
    },
    {
      name: 'Brass',
      bracket_type: 'bracket',
      families: ['Metal', 'Brass'],
      order: 2,
    },
    {
      name: 'Percussion',
      bracket_type: 'bracket',
      families: ['Percusión', 'Percussion'],
      order: 3,
    },
    {
      name: 'Keyboards',
      bracket_type: 'bracket',
      families: ['Teclado', 'Keyboard'],
      order: 4,
    },
    {
      name: 'Strings',
      bracket_type: 'brace',
      families: ['Cuerda frotada', 'Cuerda pulsada', 'Strings'],
      order: 5,
    },
  ],
};

const WIND_ORCHESTRA_CONFIG: OrchestralOrderConfig = {
  template: 'wind_orchestra',
  groups: [
    {
      name: 'Woodwinds',
      bracket_type: 'bracket',
      families: ['Madera', 'Woodwind'],
      order: 1,
    },
    {
      name: 'Saxophones',
      bracket_type: 'bracket',
      families: ['Saxofón'],
      order: 2,
    },
    {
      name: 'Brass',
      bracket_type: 'bracket',
      families: ['Metal', 'Brass'],
      order: 3,
    },
    {
      name: 'Percussion',
      bracket_type: 'bracket',
      families: ['Percusión', 'Percussion'],
      order: 4,
    },
    {
      name: 'Bass',
      bracket_type: 'bracket',
      families: ['Bajo'],
      order: 5,
    },
  ],
};

const BIG_BAND_CONFIG: OrchestralOrderConfig = {
  template: 'big_band',
  groups: [
    {
      name: 'Saxophones',
      bracket_type: 'bracket',
      families: ['Saxofón'],
      order: 1,
    },
    {
      name: 'Trumpets',
      bracket_type: 'bracket',
      families: ['Trompeta'],
      order: 2,
    },
    {
      name: 'Trombones',
      bracket_type: 'bracket',
      families: ['Trombón'],
      order: 3,
    },
    {
      name: 'Rhythm Section',
      bracket_type: 'bracket',
      families: ['Teclado', 'Cuerda pulsada', 'Percusión'],
      order: 4,
    },
  ],
};

const CHAMBER_ENSEMBLE_CONFIG: OrchestralOrderConfig = {
  template: 'chamber_ensemble',
  groups: [
    {
      name: 'Ensemble',
      bracket_type: 'brace',
      families: [],
      order: 1,
    },
  ],
};

// ============================================================
// ORDEN DENTRO DE GRUPOS
// ============================================================

const INSTRUMENT_ORDER_WITHIN_GROUP: Record<string, string[]> = {
  Woodwinds: [
    'Flautín', 'Piccolo', 'Flauta', 'Oboe', 'Corno inglés',
    'Clarinete', 'Clarinete bajo', 'Fagot', 'Contrafagón'
  ],
  Brass: [
    'Trompa', 'Trompeta', 'Trombón', 'Trombón bajo', 'Tuba'
  ],
  Percussion: [
    'Timpani', 'Percusión'
  ],
  Strings: [
    'Violín I', 'Violín II', 'Viola', 'Violonchelo', 'Contrabajo'
  ],
};

// ============================================================
// FUNCIONES PÚBLICAS
// ============================================================

/**
 * Obtiene la configuración de orden para una plantilla.
 */
export function getOrchestralOrderConfig(template: EnsembleTemplate): OrchestralOrderConfig {
  switch (template) {
    case 'symphonic_orchestra':
      return SYMPHONIC_ORCHESTRA_CONFIG;
    case 'wind_orchestra':
      return WIND_ORCHESTRA_CONFIG;
    case 'big_band':
      return BIG_BAND_CONFIG;
    case 'chamber_ensemble':
      return CHAMBER_ENSEMBLE_CONFIG;
    default:
      return SYMPHONIC_ORCHESTRA_CONFIG;
  }
}

/**
 * Ordena instrumentos según plantilla orquestal.
 */
export function sortInstrumentsByOrchestralOrder(
  instruments: ScoreInstrument[],
  config: OrchestralOrderConfig
): ScoreInstrument[] {
  const sorted = [...instruments];

  sorted.sort((a, b) => {
    // Primero por grupo
    const groupA = config.groups.find(g => g.families.includes(a.mmc_instrument_family || ''));
    const groupB = config.groups.find(g => g.families.includes(b.mmc_instrument_family || ''));

    const orderA = groupA ? groupA.order : 999;
    const orderB = groupB ? groupB.order : 999;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Dentro del mismo grupo, ordenar por nombre
    const groupName = groupA?.name || '';
    const orderList = INSTRUMENT_ORDER_WITHIN_GROUP[groupName] || [];

    const indexA = orderList.findIndex(name => a.name.includes(name));
    const indexB = orderList.findIndex(name => b.name.includes(name));

    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }

    // Si no están en la lista, ordenar alfabéticamente
    return a.name.localeCompare(b.name);
  });

  return sorted;
}

/**
 * Agrupa instrumentos según configuración.
 */
export function groupInstruments(
  instruments: ScoreInstrument[],
  config: OrchestralOrderConfig
): Map<string, ScoreInstrument[]> {
  const groups = new Map<string, ScoreInstrument[]>();

  for (const group of config.groups) {
    groups.set(group.name, []);
  }

  for (const instrument of instruments) {
    const group = config.groups.find(g =>
      g.families.includes(instrument.mmc_instrument_family || '')
    );

    const groupName = group ? group.name : 'Other';

    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }

    groups.get(groupName)!.push(instrument);
  }

  return groups;
}

/**
 * Detecta la plantilla más adecuada para un conjunto de instrumentos.
 */
export function detectEnsembleTemplate(instruments: ScoreInstrument[]): EnsembleTemplate {
  const families = new Set(instruments.map(i => i.mmc_instrument_family).filter(Boolean));

  // Si hay cuerdas frotadas, probablemente orquesta sinfónica
  if (families.has('Cuerda frotada') || families.has('Strings')) {
    return 'symphonic_orchestra';
  }

  // Si hay saxofones y metales, probablemente big band o wind orchestra
  if (families.has('Saxofón')) {
    if (families.has('Trompeta') && families.has('Trombón')) {
      return 'big_band';
    }
    return 'wind_orchestra';
  }

  // Si solo hay maderas y metales, wind orchestra
  if (families.has('Madera') && families.has('Metal')) {
    return 'wind_orchestra';
  }

  // Si hay pocos instrumentos, chamber ensemble
  if (instruments.length <= 8) {
    return 'chamber_ensemble';
  }

  // Por defecto, orquesta sinfónica
  return 'symphonic_orchestra';
}

/**
 * Obtiene el nombre del grupo para un instrumento.
 */
export function getInstrumentGroup(
  instrument: ScoreInstrument,
  config: OrchestralOrderConfig
): string {
  const group = config.groups.find(g =>
    g.families.includes(instrument.mmc_instrument_family || '')
  );
  return group ? group.name : 'Other';
}

/**
 * Obtiene el tipo de bracket para un grupo.
 */
export function getGroupBracketType(
  groupName: string,
  config: OrchestralOrderConfig
): 'brace' | 'bracket' | 'none' | 'sub-bracket' {
  const group = config.groups.find(g => g.name === groupName);
  return group ? group.bracket_type : 'none';
}
