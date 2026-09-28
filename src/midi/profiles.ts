// Perfiles musicales reutilizables para cuantización
// Cada perfil define explícitamente parámetros de cuantización

import { QuantizeConfig } from './model';

export interface MusicalProfile {
  id: string;
  name: string;
  description: string;
  version: string;
  config: QuantizeConfig;
  applicableRoles: string[];
  notes: string;
  isBuiltIn: boolean;
}

// Perfiles integrados
export const BUILT_IN_PROFILES: MusicalProfile[] = [
  {
    id: 'rhythmic_base',
    name: 'Base rítmica',
    description: 'Percusión y base rítmica. Cuantización estricta para mantener el pulso.',
    version: '1.0',
    config: {
      mode: 'strict',
      gridDivision: 16,
      useTriplets: false,
      strength: 100,
      maxDisplacement: 240,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['percussion'],
    notes: 'Ideal para batería y percusión. Rejilla de semicorcheas para máxima precisión rítmica.',
    isBuiltIn: true
  },
  {
    id: 'mono_bass',
    name: 'Bajo monofónico',
    description: 'Bajo de una sola voz. Conserva la línea melódica del bajo.',
    version: '1.0',
    config: {
      mode: 'strict',
      gridDivision: 8,
      useTriplets: false,
      strength: 90,
      maxDisplacement: 360,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['bass'],
    notes: 'Rejilla de corcheas. No impone monofonía automáticamente; revisa solapamientos.',
    isBuiltIn: true
  },
  {
    id: 'harmonic_accompaniment',
    name: 'Acompañamiento armónico',
    description: 'Acordes y acompañamiento. Protege la simultaneidad de acordes.',
    version: '1.0',
    config: {
      mode: 'strict',
      gridDivision: 8,
      useTriplets: false,
      strength: 85,
      maxDisplacement: 360,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['harmony'],
    notes: 'Protege acordes simultáneos. Rejilla de corcheas para acordes rítmicos.',
    isBuiltIn: true
  },
  {
    id: 'string_melody',
    name: 'Melodía de cuerda',
    description: 'Melodía para instrumentos de cuerda. Conserva legato y expresión.',
    version: '1.0',
    config: {
      mode: 'interpretive',
      gridDivision: 8,
      useTriplets: false,
      strength: 60,
      maxDisplacement: 480,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['melody', 'strings'],
    notes: 'Modo interpretativo para conservar la expresividad. No fuerza notas a la rejilla.',
    isBuiltIn: true
  },
  {
    id: 'woodwind_melody',
    name: 'Melodía de madera',
    description: 'Flautas, clarinetes, oboes. Conserva articulaciones.',
    version: '1.0',
    config: {
      mode: 'interpretive',
      gridDivision: 16,
      useTriplets: true,
      strength: 70,
      maxDisplacement: 360,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['melody', 'woodwinds'],
    notes: 'Admite tresillos. Conserva staccato y legato.',
    isBuiltIn: true
  },
  {
    id: 'trumpets',
    name: 'Trompetas y metales',
    description: 'Sección de metales. Cuantización precisa para ataques limpios.',
    version: '1.0',
    config: {
      mode: 'strict',
      gridDivision: 8,
      useTriplets: false,
      strength: 95,
      maxDisplacement: 360,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['brass', 'melody'],
    notes: 'Ataques precisos para sección de metales. Conserva acordes de la sección.',
    isBuiltIn: true
  },
  {
    id: 'polyphony',
    name: 'Polifonía',
    description: 'Varias voces simultáneas. Conserva independencia de voces.',
    version: '1.0',
    config: {
      mode: 'interpretive',
      gridDivision: 16,
      useTriplets: false,
      strength: 70,
      maxDisplacement: 360,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['melody', 'harmony'],
    notes: 'No convierte acordes en arpegios. Señala clusters ambiguos para revisión.',
    isBuiltIn: true
  },
  {
    id: 'expressive',
    name: 'Interpretación expresiva',
    description: 'Máxima conservación de la interpretación humana.',
    version: '1.0',
    config: {
      mode: 'interpretive',
      gridDivision: 16,
      useTriplets: true,
      strength: 40,
      maxDisplacement: 480,
      quantizeAttacksOnly: true,
      normalizeDuration: false,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['melody', 'strings', 'woodwinds', 'brass'],
    notes: 'Solo corrige desviaciones muy grandes. Conserva la mayor parte de la expresión.',
    isBuiltIn: true
  },
  {
    id: 'notation_prep',
    name: 'Preparación para notación',
    description: 'Limpieza para partitura legible. Cuantización estricta con revisión.',
    version: '1.0',
    config: {
      mode: 'assisted',
      gridDivision: 16,
      useTriplets: true,
      strength: 100,
      maxDisplacement: 240,
      quantizeAttacksOnly: false,
      normalizeDuration: true,
      swingAmount: 0,
      preserveSelected: true,
      collisionPolicy: 'flag',
      trackIndices: []
    },
    applicableRoles: ['melody', 'harmony', 'strings', 'woodwinds', 'brass', 'bass'],
    notes: 'Modo asistido: propone correcciones para revisión. Normaliza duraciones para notación limpia.',
    isBuiltIn: true
  }
];

// Gestión de perfiles personalizados
const CUSTOM_PROFILES_KEY = 'midi-custom-profiles';

export function loadCustomProfiles(): MusicalProfile[] {
  try {
    const data = localStorage.getItem(CUSTOM_PROFILES_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error('Error loading custom profiles:', e);
    return [];
  }
}

export function saveCustomProfile(profile: MusicalProfile): void {
  const profiles = loadCustomProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(profiles));
}

export function deleteCustomProfile(id: string): void {
  const profiles = loadCustomProfiles().filter(p => p.id !== id);
  localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(profiles));
}

export function getAllProfiles(): MusicalProfile[] {
  return [...BUILT_IN_PROFILES, ...loadCustomProfiles()];
}

export function getProfileById(id: string): MusicalProfile | undefined {
  return getAllProfiles().find(p => p.id === id);
}

export function duplicateProfile(profile: MusicalProfile): MusicalProfile {
  return {
    ...profile,
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: `${profile.name} (copia)`,
    isBuiltIn: false,
    version: '1.0'
  };
}

export function createProfileFromConfig(name: string, description: string, config: QuantizeConfig): MusicalProfile {
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    description,
    version: '1.0',
    config: { ...config },
    applicableRoles: [],
    notes: 'Perfil personalizado.',
    isBuiltIn: false
  };
}

export function exportProfile(profile: MusicalProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string): MusicalProfile | null {
  try {
    const profile = JSON.parse(json) as MusicalProfile;
    // Validate structure
    if (!profile.id || !profile.name || !profile.config) {
      return null;
    }
    // Ensure it's marked as custom
    profile.isBuiltIn = false;
    profile.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    return profile;
  } catch (e) {
    return null;
  }
}

export function applyProfileToProject(profile: MusicalProfile, trackIndices: number[]): QuantizeConfig {
  return {
    ...profile.config,
    trackIndices
  };
}
