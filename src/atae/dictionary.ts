/**
 * Auto Track Assignment Engine (ATAE) - Instrument Dictionary
 * Diccionario multilingüe de alias de instrumentos
 */

import { InstrumentDefinition, InstrumentFamily } from './types';

/**
 * Diccionario extensible de instrumentos con alias multilingües
 */
export const INSTRUMENT_DICTIONARY: InstrumentDefinition[] = [
  // ========== WOODWINDS (MADERA) ==========
  {
    id: 'flute',
    name: 'Flute',
    family: 'WOODWIND',
    aliases: ['flute', 'flauta', 'flûte', 'flöte', 'flauto', 'fl', 'flt'],
    gmPrograms: [73, 74],
    typicalRegister: { min: 60, max: 96 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'piccolo',
    name: 'Piccolo',
    family: 'WOODWIND',
    aliases: ['piccolo', 'flautín', 'flautin', 'picc', 'flauto piccolo'],
    gmPrograms: [72],
    typicalRegister: { min: 74, max: 102 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'oboe',
    name: 'Oboe',
    family: 'WOODWIND',
    aliases: ['oboe', 'ob', 'oboe', 'hautbois'],
    gmPrograms: [68],
    typicalRegister: { min: 58, max: 91 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'english_horn',
    name: 'English Horn',
    family: 'WOODWIND',
    aliases: ['english horn', 'corno inglés', 'corno ingles', 'cor anglais', 'eh', 'cor angl'],
    gmPrograms: [69],
    typicalRegister: { min: 52, max: 81 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'clarinet',
    name: 'Clarinet',
    family: 'WOODWIND',
    aliases: ['clarinet', 'clarinete', 'clarinette', 'klarinet', 'clarinetto', 'cl', 'clar'],
    gmPrograms: [71],
    typicalRegister: { min: 50, max: 94 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'bass_clarinet',
    name: 'Bass Clarinet',
    family: 'WOODWIND',
    aliases: ['bass clarinet', 'clarinete bajo', 'bassklarinette', 'bcl'],
    gmPrograms: [71],
    typicalRegister: { min: 38, max: 79 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'bassoon',
    name: 'Bassoon',
    family: 'WOODWIND',
    aliases: ['bassoon', 'fagot', 'fagotto', 'fagott', 'basson', 'fg', 'fag'],
    gmPrograms: [70],
    typicalRegister: { min: 34, max: 75 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'contrabassoon',
    name: 'Contrabassoon',
    family: 'WOODWIND',
    aliases: ['contrabassoon', 'contrafagot', 'contrafagotto', 'contrabassoon', 'cbn'],
    gmPrograms: [70],
    typicalRegister: { min: 24, max: 63 },
    primarilyMonophonic: true,
    orchestralGroup: 'Woodwinds',
  },
  {
    id: 'saxophone',
    name: 'Saxophone',
    family: 'WOODWIND',
    aliases: ['sax', 'saxophone', 'saxofón', 'saxofon', 'saxofono', 'sx'],
    gmPrograms: [64, 65, 66, 67],
    primarilyMonophonic: true,
    orchestralGroup: 'Saxophones',
  },
  {
    id: 'recorder',
    name: 'Recorder',
    family: 'WOODWIND',
    aliases: ['recorder', 'flauta dulce', 'flûte à bec', 'blockflöte'],
    gmPrograms: [74],
    primarilyMonophonic: true,
  },

  // ========== BRASS (METAL) ==========
  {
    id: 'trumpet',
    name: 'Trumpet',
    family: 'BRASS',
    aliases: ['trumpet', 'trompeta', 'trompette', 'trompete', 'tromba', 'tpt', 'tp'],
    gmPrograms: [56, 59],
    typicalRegister: { min: 52, max: 79 },
    primarilyMonophonic: true,
    orchestralGroup: 'Brass',
  },
  {
    id: 'horn',
    name: 'French Horn',
    family: 'BRASS',
    aliases: ['horn', 'french horn', 'trompa', 'cor', 'horn', 'corno', 'hn'],
    gmPrograms: [60],
    typicalRegister: { min: 36, max: 77 },
    primarilyMonophonic: true,
    orchestralGroup: 'Brass',
  },
  {
    id: 'trombone',
    name: 'Trombone',
    family: 'BRASS',
    aliases: ['trombone', 'trombón', 'trombone', 'posaune', 'tbn', 'trb'],
    gmPrograms: [57],
    typicalRegister: { min: 36, max: 72 },
    primarilyMonophonic: true,
    orchestralGroup: 'Brass',
  },
  {
    id: 'bass_trombone',
    name: 'Bass Trombone',
    family: 'BRASS',
    aliases: ['bass trombone', 'trombón bajo', 'bassposaune', 'btbn'],
    gmPrograms: [57],
    typicalRegister: { min: 28, max: 65 },
    primarilyMonophonic: true,
    orchestralGroup: 'Brass',
  },
  {
    id: 'tuba',
    name: 'Tuba',
    family: 'BRASS',
    aliases: ['tuba', 'tuba', 'tuba', 'tuba', 'tb'],
    gmPrograms: [58],
    typicalRegister: { min: 28, max: 58 },
    primarilyMonophonic: true,
    orchestralGroup: 'Brass',
  },

  // ========== STRINGS (CUERDAS) ==========
  {
    id: 'violin',
    name: 'Violin',
    family: 'STRINGS',
    aliases: ['violin', 'violín', 'violino', 'violon', 'vn', 'vln'],
    gmPrograms: [40],
    typicalRegister: { min: 55, max: 103 },
    primarilyMonophonic: false,
    orchestralGroup: 'Strings',
  },
  {
    id: 'viola',
    name: 'Viola',
    family: 'STRINGS',
    aliases: ['viola', 'viole', 'bratsche', 'vla', 'va'],
    gmPrograms: [41],
    typicalRegister: { min: 48, max: 91 },
    primarilyMonophonic: false,
    orchestralGroup: 'Strings',
  },
  {
    id: 'cello',
    name: 'Cello',
    family: 'STRINGS',
    aliases: ['cello', 'violonchelo', 'violoncello', 'violoncelle', 'violoncel', 'vc', 'vlc'],
    gmPrograms: [42],
    typicalRegister: { min: 36, max: 80 },
    primarilyMonophonic: false,
    orchestralGroup: 'Strings',
  },
  {
    id: 'double_bass',
    name: 'Double Bass',
    family: 'STRINGS',
    aliases: ['double bass', 'contrabajo', 'contrebasse', 'kontrabass', 'contrabasso', 'cb', 'contra', 'db', 'string bass'],
    gmPrograms: [43],
    typicalRegister: { min: 28, max: 67 },
    primarilyMonophonic: false,
    orchestralGroup: 'Strings',
  },
  {
    id: 'harp',
    name: 'Harp',
    family: 'STRINGS',
    aliases: ['harp', 'arpa', 'harpe', 'harfe', 'arpa', 'hp'],
    gmPrograms: [46],
    primarilyMonophonic: false,
    orchestralGroup: 'Keyboards/Harp',
  },

  // ========== PERCUSSION ==========
  {
    id: 'drums',
    name: 'Drums',
    family: 'PERCUSSION',
    aliases: ['drums', 'drum', 'batería', 'bateria', 'drum set', 'drumkit', 'perc', 'percussion', 'percusión', 'batterie', 'schlagzeug', 'batteria', 'dr'],
    gmPrograms: [],
    primarilyMonophonic: false,
    orchestralGroup: 'Percussion',
  },
  {
    id: 'timpani',
    name: 'Timpani',
    family: 'PERCUSSION',
    aliases: ['timpani', 'tympani', 'timp', 'timpani', 'pauken'],
    gmPrograms: [47],
    primarilyMonophonic: false,
    orchestralGroup: 'Percussion',
  },

  // ========== KEYBOARDS ==========
  {
    id: 'piano',
    name: 'Piano',
    family: 'KEYBOARD',
    aliases: ['piano', 'pianoforte', 'pianoforte', 'pf', 'pno'],
    gmPrograms: [0, 1, 2, 3, 4],
    primarilyMonophonic: false,
    orchestralGroup: 'Keyboards/Harp',
  },
  {
    id: 'organ',
    name: 'Organ',
    family: 'KEYBOARD',
    aliases: ['organ', 'órgano', 'organo', 'orgue', 'orgel', 'org'],
    gmPrograms: [16, 17, 18, 19],
    primarilyMonophonic: false,
  },
  {
    id: 'harpsichord',
    name: 'Harpsichord',
    family: 'KEYBOARD',
    aliases: ['harpsichord', 'clave', 'clavecín', 'clavecin', 'cembalo', 'hpd'],
    gmPrograms: [6],
    primarilyMonophonic: false,
  },
];

/**
 * Busca un instrumento por nombre o alias
 */
export function findInstrumentByName(name: string): InstrumentDefinition | null {
  const normalizedName = name.toLowerCase().trim();
  
  for (const instrument of INSTRUMENT_DICTIONARY) {
    // Coincidencia exacta con nombre
    if (instrument.name.toLowerCase() === normalizedName) {
      return instrument;
    }
    
    // Coincidencia con alias
    for (const alias of instrument.aliases) {
      if (alias.toLowerCase() === normalizedName) {
        return instrument;
      }
    }
    
    // Coincidencia parcial (contiene)
    if (normalizedName.includes(instrument.name.toLowerCase()) ||
        instrument.aliases.some(alias => normalizedName.includes(alias))) {
      return instrument;
    }
  }
  
  return null;
}

/**
 * Busca instrumentos por programa GM
 */
export function findInstrumentsByProgram(program: number): InstrumentDefinition[] {
  return INSTRUMENT_DICTIONARY.filter(inst => 
    inst.gmPrograms && inst.gmPrograms.includes(program)
  );
}

/**
 * Obtiene la familia por nombre
 */
export function getFamilyDisplayName(family: InstrumentFamily): string {
  const names: Record<InstrumentFamily, string> = {
    'WOODWIND': 'Madera',
    'BRASS': 'Metal',
    'STRINGS': 'Cuerdas',
    'PERCUSSION': 'Percusión',
    'KEYBOARD': 'Teclado',
    'SYNTH': 'Sintetizador',
    'VOX': 'Voz',
    'UNKNOWN': 'Desconocido',
  };
  return names[family] || 'Desconocido';
}
