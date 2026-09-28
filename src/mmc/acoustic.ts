/**
 * MMC v1.0 — Acoustic Evidence Layer
 *
 * Sección 9 del spec.
 *
 * IMPORTANTE: Esta capa solo calcula lo que es derivable
 * directamente de los datos MIDI (pitch → frecuencia).
 *
 * NO simula análisis espectral, armónicos, centroides, etc.
 * que requerirían audio real. Esos campos permanecen null.
 *
 * Lo que SÍ calcula:
 * - fundamental_frequency a partir de pitch_midi
 * - rms_energy como proxy de velocity
 * - periodicity como proxy de pitch stability
 */

import { MMCProject, MMCEvent } from './types';
import { applyTransformationIfAllowed, createLogEntry } from './history';

const MODULE = 'mmc.acoustic';
const MODULE_VERSION = '1.0.0';

/**
 * Convierte pitch MIDI a frecuencia en Hz.
 * f = 440 * 2^((m-69)/12)
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convierte frecuencia a pitch MIDI (aproximado).
 * m = 69 + 12 * log2(f / 440)
 */
export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

/**
 * Verifica si una frecuencia es armónico de otra.
 * Un armónico está en múltiplos enteros de la fundamental.
 */
export function isHarmonicOf(f1: number, f2: number, tolerance: number = 0.05): boolean {
  if (f1 === 0 || f2 === 0) return false;
  const ratio = Math.max(f1, f2) / Math.min(f1, f2);
  const nearestInteger = Math.round(ratio);
  return Math.abs(ratio - nearestInteger) < tolerance && nearestInteger >= 2;
}

/**
 * Ejecuta el análisis acústico básico (solo lo derivable de MIDI).
 */
export function runAcousticAnalysis(project: MMCProject): {
  project: MMCProject;
  eventsUpdated: number;
  log: ReturnType<typeof createLogEntry>[];
} {
  // Esta capa está parcialmente habilitada: solo calcula lo posible
  // ACOUSTIC_VALIDATION_ENABLED controla análisis más profundo
  const log: ReturnType<typeof createLogEntry>[] = [];
  const newEvents = new Map(project.events);
  let eventsUpdated = 0;

  log.push(createLogEntry('INFO', MODULE, 'Iniciando análisis acústico básico'));

  for (const [eventId, event] of newEvents) {
    // Fundamental frequency: siempre calculable desde pitch
    const fundamentalFreq = midiToFrequency(event.pitch_midi);

    // RMS energy: proxy basado en velocity
    const rmsEnergy = event.velocity / 127;

    // Periodicity: proxy basado en estabilidad del pitch
    // (en MIDI real no hay variación, pero podemos comparar con eventos cercanos)
    const periodicity = 1.0; // MIDI es determinista

    const result = applyTransformationIfAllowed(
      event, MODULE, MODULE_VERSION, 'acoustic_proxy_update',
      'fundamental_frequency', fundamentalFreq,
      `Frecuencia fundamental calculada desde pitch ${event.pitch_midi}`,
      1.0
    );

    if (result.applied) {
      newEvents.set(eventId, {
        ...result.event,
        fundamental_frequency: fundamentalFreq,
        rms_energy: rmsEnergy,
        periodicity: periodicity,
        confidence_acoustic: 0.6, // Confianza media: es proxy, no análisis real
      });
      eventsUpdated++;
    }
  }

  log.push(
    createLogEntry(
      'INFO', MODULE,
      `Análisis acústico básico completado: ${eventsUpdated} eventos actualizados. ` +
      `Nota: harmonic_profile, spectral_centroid, spectral_flux, envelope, noise_ratio ` +
      `permanecen null (requieren audio real).`
    )
  );

  return {
    project: { ...project, events: newEvents, log: [...project.log, ...log] },
    eventsUpdated,
    log,
  };
}

/**
 * Verifica si dos eventos podrían ser el mismo armónico.
 */
export function couldBeHarmonic(e1: MMCEvent, e2: MMCEvent): boolean {
  if (e1.fundamental_frequency === null || e2.fundamental_frequency === null) {
    return false;
  }
  return isHarmonicOf(e1.fundamental_frequency, e2.fundamental_frequency);
}
