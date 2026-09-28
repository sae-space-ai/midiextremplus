// Catálogo de instrumentos MIDI con propiedades de transposición y registro

export interface InstrumentInfo {
  program: number;
  name: string;
  family: string;
  isTransposing: boolean;
  writtenToConcert: number; // semitonos: 0 = no transpone, -2 = suena una 2ª menor abajo
  minPitch: number;
  maxPitch: number;
  description: string;
}

export const INSTRUMENT_CATALOG: InstrumentInfo[] = [
  // Piano
  { program: 0, name: 'Piano de cola', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 21, maxPitch: 108, description: 'Piano acústico de concierto' },
  { program: 1, name: 'Piano brillante', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 21, maxPitch: 108, description: 'Piano con más presencia' },
  { program: 2, name: 'Piano eléctrico', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 24, maxPitch: 108, description: 'Piano eléctrico tipo Rhodes' },
  { program: 4, name: 'Piano eléctrico 1', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 24, maxPitch: 108, description: 'Piano eléctrico DX' },
  
  // Órgano
  { program: 16, name: 'Órgano', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 96, description: 'Órgano Hammond' },
  { program: 18, name: 'Órgano rock', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 96, description: 'Órgano percusivo' },
  { program: 19, name: 'Órgano de iglesia', family: 'Teclado', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 96, description: 'Órgano de tubos' },
  
  // Cuerdas
  { program: 40, name: 'Violín', family: 'Cuerda frotada', isTransposing: false, writtenToConcert: 0, minPitch: 55, maxPitch: 103, description: 'Violín orquestal (G3-E7)' },
  { program: 41, name: 'Viola', family: 'Cuerda frotada', isTransposing: false, writtenToConcert: 0, minPitch: 48, maxPitch: 96, description: 'Viola (C3-C6)' },
  { program: 42, name: 'Violonchelo', family: 'Cuerda frotada', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 84, description: 'Violonchelo (C2-C6)' },
  { program: 43, name: 'Contrabajo', family: 'Cuerda frotada', isTransposing: true, writtenToConcert: -12, minPitch: 28, maxPitch: 67, description: 'Contrabajo (suena una octava abajo de lo escrito)' },
  { program: 44, name: 'Tremolo strings', family: 'Cuerda frotada', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 96, description: 'Sección de cuerdas con tremolo' },
  { program: 45, name: 'Pizzicato strings', family: 'Cuerda frotada', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 96, description: 'Cuerdas pizzicato' },
  { program: 46, name: 'Arpa', family: 'Cuerda pulsada', isTransposing: false, writtenToConcert: 0, minPitch: 24, maxPitch: 108, description: 'Arpa de concierto' },
  
  // Metal
  { program: 56, name: 'Trompeta', family: 'Metal', isTransposing: true, writtenToConcert: -2, minPitch: 52, maxPitch: 79, description: 'Trompeta en Si♭ (suena un tono abajo)' },
  { program: 57, name: 'Trombón', family: 'Metal', isTransposing: false, writtenToConcert: 0, minPitch: 40, maxPitch: 72, description: 'Trombón tenor en Do' },
  { program: 58, name: 'Tuba', family: 'Metal', isTransposing: false, writtenToConcert: 0, minPitch: 28, maxPitch: 58, description: 'Tuba en Do' },
  { program: 59, name: 'Trompeta con sordina', family: 'Metal', isTransposing: true, writtenToConcert: -2, minPitch: 52, maxPitch: 79, description: 'Trompeta con sordina Harmon' },
  { program: 60, name: 'Trompa', family: 'Metal', isTransposing: true, writtenToConcert: -7, minPitch: 48, maxPitch: 79, description: 'Trompa en Fa (suena una 5ª abajo)' },
  { program: 61, name: 'Sección de metales', family: 'Metal', isTransposing: false, writtenToConcert: 0, minPitch: 36, maxPitch: 79, description: 'Brass section completa' },
  
  // Madera
  { program: 64, name: 'Saxofón soprano', family: 'Madera', isTransposing: true, writtenToConcert: -2, minPitch: 56, maxPitch: 87, description: 'Saxo soprano en Si♭' },
  { program: 65, name: 'Saxofón alto', family: 'Madera', isTransposing: true, writtenToConcert: -9, minPitch: 49, maxPitch: 82, description: 'Saxo alto en Mi♭ (suena 6ª mayor abajo)' },
  { program: 66, name: 'Saxofón tenor', family: 'Madera', isTransposing: true, writtenToConcert: -14, minPitch: 44, maxPitch: 79, description: 'Saxo tenor en Si♭ (suena 9ª abajo)' },
  { program: 67, name: 'Saxofón barítono', family: 'Madera', isTransposing: true, writtenToConcert: -21, minPitch: 37, maxPitch: 72, description: 'Saxo barítono en Mi♭' },
  { program: 68, name: 'Oboe', family: 'Madera', isTransposing: false, writtenToConcert: 0, minPitch: 58, maxPitch: 91, description: 'Oboe (Bb3-G6)' },
  { program: 69, name: 'Corno inglés', family: 'Madera', isTransposing: true, writtenToConcert: -7, minPitch: 52, maxPitch: 79, description: 'Corno inglés en Fa (suena 5ª abajo)' },
  { program: 70, name: 'Fagot', family: 'Madera', isTransposing: false, writtenToConcert: 0, minPitch: 34, maxPitch: 77, description: 'Fagot (Bb1-G4)' },
  { program: 71, name: 'Clarinete', family: 'Madera', isTransposing: true, writtenToConcert: -2, minPitch: 50, maxPitch: 94, description: 'Clarinete en Si♭ (suena un tono abajo)' },
  { program: 72, name: 'Flautín', family: 'Madera', isTransposing: true, writtenToConcert: 12, minPitch: 74, maxPitch: 108, description: 'Piccolo (suena una octava arriba)' },
  { program: 73, name: 'Flauta', family: 'Madera', isTransposing: false, writtenToConcert: 0, minPitch: 60, maxPitch: 96, description: 'Flauta travesera (C4-C7)' },
  { program: 74, name: 'Flauta de pico', family: 'Madera', isTransposing: false, writtenToConcert: 0, minPitch: 65, maxPitch: 101, description: 'Flauta dulce soprano' },
  { program: 75, name: 'Flauta de pan', family: 'Madera', isTransposing: false, writtenToConcert: 0, minPitch: 55, maxPitch: 91, description: 'Zampoña' },
  
  // Guitarra
  { program: 24, name: 'Guitarra acústica', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 40, maxPitch: 88, description: 'Guitarra española (suena octava abajo)' },
  { program: 25, name: 'Guitarra eléctrica limpia', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 40, maxPitch: 88, description: 'Guitarra limpia' },
  { program: 26, name: 'Guitarra eléctrica mordida', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 40, maxPitch: 88, description: 'Guitarra con overdrive' },
  { program: 27, name: 'Guitarra muted', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 40, maxPitch: 88, description: 'Guitarra con palm mute' },
  
  // Bajo
  { program: 32, name: 'Bajo acústico', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 28, maxPitch: 67, description: 'Contrabajo jazz (suena octava abajo)' },
  { program: 33, name: 'Bajo eléctrico dedo', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 28, maxPitch: 67, description: 'Bajo finger style' },
  { program: 34, name: 'Bajo eléctrico púa', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 28, maxPitch: 67, description: 'Bajo con púa' },
  { program: 35, name: 'Bajo sin trastes', family: 'Cuerda pulsada', isTransposing: true, writtenToConcert: -12, minPitch: 28, maxPitch: 67, description: 'Fretless bass' },
  
  // Sintetizadores
  { program: 80, name: 'Lead 1 (square)', family: 'Sintetizador', isTransposing: false, writtenToConcert: 0, minPitch: 0, maxPitch: 127, description: 'Synth lead onda cuadrada' },
  { program: 81, name: 'Lead 2 (sawtooth)', family: 'Sintetizador', isTransposing: false, writtenToConcert: 0, minPitch: 0, maxPitch: 127, description: 'Synth lead sierra' },
  { program: 88, name: 'Pad 1 (new age)', family: 'Sintetizador', isTransposing: false, writtenToConcert: 0, minPitch: 0, maxPitch: 127, description: 'Pad ambient' },
  { program: 89, name: 'Pad 2 (warm)', family: 'Sintetizador', isTransposing: false, writtenToConcert: 0, minPitch: 0, maxPitch: 127, description: 'Pad cálido' },
];

export function getInstrumentByProgram(program: number): InstrumentInfo | undefined {
  return INSTRUMENT_CATALOG.find(i => i.program === program);
}

export function getInstrumentName(program: number): string {
  const inst = getInstrumentByProgram(program);
  return inst ? inst.name : `Programa ${program}`;
}

export function getInstrumentsByFamily(family: string): InstrumentInfo[] {
  return INSTRUMENT_CATALOG.filter(i => i.family === family);
}

export function getAllFamilies(): string[] {
  return [...new Set(INSTRUMENT_CATALOG.map(i => i.family))];
}

/**
 * Calcula la altura de concierto a partir de la escrita
 */
export function writtenToConcertPitch(writtenPitch: number, instrument: InstrumentInfo): number {
  return writtenPitch + instrument.writtenToConcert;
}

/**
 * Calcula la altura escrita a partir de la de concierto
 */
export function concertToWrittenPitch(concertPitch: number, instrument: InstrumentInfo): number {
  return concertPitch - instrument.writtenToConcert;
}

/**
 * Verifica si una nota está dentro del registro del instrumento
 */
export function isInRange(pitch: number, instrument: InstrumentInfo): boolean {
  return pitch >= instrument.minPitch && pitch <= instrument.maxPitch;
}
