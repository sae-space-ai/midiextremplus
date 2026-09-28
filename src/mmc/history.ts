/**
 * MMC v1.0 — Transformation History
 *
 * Trazabilidad completa de cada modificación.
 * Sección 13 del spec.
 *
 * Cada evento conserva su cadena completa de transformaciones.
 * Permite UNDO, auditoría, comparación A/B y reproducibilidad.
 */

import { TransformationRecord, MMCEvent, MMCLogEntry } from './types';

let transformationIdCounter = 0;

function nextTransformationId(): string {
  return `tf_${++transformationIdCounter}_${Date.now()}`;
}

/**
 * Registra una transformación en un evento.
 * No modifica el evento directamente; devuelve un nuevo evento.
 */
export function recordTransformation(
  event: MMCEvent,
  module: string,
  moduleVersion: string,
  operation: string,
  fieldChanged: string,
  valueBefore: unknown,
  valueAfter: unknown,
  reason: string,
  confidence: number | null,
  humanOverride: boolean = false
): MMCEvent {
  const record: TransformationRecord = {
    id: nextTransformationId(),
    timestamp: Date.now(),
    module,
    module_version: moduleVersion,
    operation,
    field_changed: fieldChanged,
    value_before: valueBefore,
    value_after: valueAfter,
    reason,
    confidence,
    human_override: humanOverride,
  };

  return {
    ...event,
    transformation_history: [...event.transformation_history, record],
    human_override: humanOverride || event.human_override,
  };
}

/**
 * Obtiene el valor original de un campo (antes de cualquier transformación).
 */
export function getOriginalValue(
  event: MMCEvent,
  field: keyof MMCEvent
): unknown {
  if (event.transformation_history.length === 0) {
    return event[field];
  }
  const firstTransform = event.transformation_history.find(
    (t) => t.field_changed === field
  );
  if (firstTransform) {
    return firstTransform.value_before;
  }
  return event[field];
}

/**
 * Obtiene el valor más reciente de un campo.
 */
export function getCurrentValue(
  event: MMCEvent,
  field: keyof MMCEvent
): unknown {
  const transforms = event.transformation_history.filter(
    (t) => t.field_changed === field
  );
  if (transforms.length === 0) {
    return event[field];
  }
  return transforms[transforms.length - 1].value_after;
}

/**
 * Verifica si un evento ha sido modificado por intervención humana.
 * Sección 14 del spec: human override no debe sobrescribirse.
 */
export function hasHumanOverride(event: MMCEvent): boolean {
  return (
    event.human_override ||
    event.transformation_history.some((t) => t.human_override)
  );
}

/**
 * Verifica si un campo específico fue modificado por humano.
 */
export function fieldHasHumanOverride(
  event: MMCEvent,
  field: string
): boolean {
  return event.transformation_history.some(
    (t) => t.field_changed === field && t.human_override
  );
}

/**
 * Obtiene el módulo responsable de la última modificación de un campo.
 */
export function getLastModifier(
  event: MMCEvent,
  field: string
): { module: string; timestamp: number } | null {
  const transforms = event.transformation_history.filter(
    (t) => t.field_changed === field
  );
  if (transforms.length === 0) return null;
  const last = transforms[transforms.length - 1];
  return { module: last.module, timestamp: last.timestamp };
}

/**
 * Obtiene todas las transformaciones de un evento ordenadas.
 */
export function getTransformationChain(event: MMCEvent): TransformationRecord[] {
  return [...event.transformation_history].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

/**
 * Cuenta transformaciones por módulo.
 */
export function countTransformationsByModule(
  event: MMCEvent
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of event.transformation_history) {
    counts.set(t.module, (counts.get(t.module) || 0) + 1);
  }
  return counts;
}

/**
 * Registra un log de operación MMC.
 */
export function createLogEntry(
  level: MMCLogEntry['level'],
  module: string,
  message: string,
  eventId?: string,
  data?: unknown
): MMCLogEntry {
  return {
    timestamp: Date.now(),
    level,
    module,
    message,
    event_id: eventId,
    data,
  };
}

/**
 * Aplica una transformación solo si no hay human override en el campo.
 * Sección 14 del spec.
 */
export function applyTransformationIfAllowed(
  event: MMCEvent,
  module: string,
  moduleVersion: string,
  operation: string,
  fieldChanged: keyof MMCEvent,
  newValue: unknown,
  reason: string,
  confidence: number | null
): { event: MMCEvent; applied: boolean } {
  if (fieldHasHumanOverride(event, fieldChanged as string)) {
    return { event, applied: false };
  }

  const oldValue = event[fieldChanged];
  const updated = recordTransformation(
    event,
    module,
    moduleVersion,
    operation,
    fieldChanged as string,
    oldValue,
    newValue,
    reason,
    confidence
  );

  return {
    event: { ...updated, [fieldChanged]: newValue },
    applied: true,
  };
}
