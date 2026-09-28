# Sovereign Autocorrection Engine (SAE) - Documentación

## Resumen

El **Sovereign Autocorrection Engine (SAE)** es un motor de corrección autónoma que analiza, diagnostica y corrige la obra completa de forma soberana, preservando la intención musical y aplicando solo correcciones con evidencia suficiente.

**Estado: IMPLEMENTADO ✓**

---

## Arquitectura

### Principios fundamentales

1. **No destructivo**: El original siempre se preserva
2. **Evidencia suficiente**: Solo corrige con confianza alta
3. **Contextual**: Analiza eventos en su contexto completo
4. **Trazable**: Cada corrección se registra con justificación
5. **Reversible**: Permite revertir todas las correcciones
6. **Transparente**: Explica qué corrigió y por qué

### Estructura de módulos

```
src/sae/
├── types.ts                 # Tipos fundamentales
├── context-analyzer.ts      # Análisis contextual
├── issue-detector.ts        # Detector de incidencias
├── engine.ts                # Motor principal
└── index.ts                 # API pública
```

---

## Flujo de trabajo

```
1. Usuario carga MIDI
   ↓
2. Construye MMC (Matriz Maestra de Conversión)
   ↓
3. Ejecuta SAE: ANALYZE & AUTOCORRECT COMPLETE SCORE
   ↓
4. SAE ejecuta pipeline:
   - Preserva original
   - Detecta incidencias
   - Construye plan de corrección
   - Simula correcciones
   - Valida correcciones
   - Aplica correcciones
   - Genera reporte
   ↓
5. Usuario revisa reporte
   ↓
6. Acepta o revierte correcciones
   ↓
7. Exporta resultado (MIDI, Score, Parts, MusicXML)
```

---

## Módulos implementados

### 1. Context Analyzer (`context-analyzer.ts`)

**Propósito**: Analiza eventos en su contexto completo (no aisladamente).

**Características**:
- Construye contexto completo para cada evento
- Analiza eventos anteriores y siguientes
- Detecta patrones rítmicos
- Analiza continuidad melódica
- Detecta patrones de swing
- Identifica timing expresivo

**Funciones principales**:
- `buildEventContext()`: Construye contexto completo
- `analyzeMelodicContinuity()`: Analiza continuidad melódica
- `detectSwingPattern()`: Detecta patrones de swing

### 2. Issue Detector (`issue-detector.ts`)

**Propósito**: Detecta incidencias en contexto completo.

**Tipos de incidencias detectadas**:
- `OFF_GRID`: Eventos desviados de la rejilla
- `CLUSTER_SUSPECT`: Clusters sospechosos en instrumentos monofónicos
- `MICRO_GAP`: Micro-gaps entre eventos continuos
- `ZERO_DURATION`: Duraciones cero o negativas
- `ABNORMAL_DURATION`: Duraciones anormalmente cortas/largas
- `DUPLICATE_NOTE`: Notas duplicadas
- `VOICE_COLLISION`: Colisiones de voz
- `OUT_OF_RANGE`: Notas fuera del rango del instrumento
- `SWING_PATTERN`: Patrones de swing detectados

**Características**:
- Análisis contextual (no aislado)
- Detección de patrones sistemáticos
- Clasificación por severidad
- Evidencia detallada

### 3. Engine (`engine.ts`)

**Propósito**: Motor principal de autocorrección soberana.

**Pipeline completo**:
1. **Preservar original**: Copia profunda del proyecto
2. **Detectar incidencias**: Análisis completo
3. **Construir plan**: Genera propuestas de corrección
4. **Simular**: Prueba correcciones sin aplicar
5. **Validar**: Verifica que no introduce nuevos problemas
6. **Aplicar**: Ejecuta correcciones con confianza suficiente
7. **Reconciliar**: Validación global final
8. **Reportar**: Genera reporte detallado

**Sistema de confianza**:
- `VERY_HIGH` (≥0.9): Corrección casi segura
- `HIGH` (≥0.75): Corrección muy probable
- `MEDIUM` (≥0.6): Requiere validación contextual
- `LOW` (<0.6): No corregir automáticamente

**Protecciones**:
- No sobrescribe `human_override`
- No corrige patrones de swing
- No corrige timing expresivo
- Configurable por usuario

**Funciones principales**:
- `runSovereignAutocorrection()`: Ejecuta pipeline completo
- `buildCorrectionPlan()`: Construye plan de corrección
- `createCorrectionProposal()`: Genera propuesta individual
- `simulateCorrections()`: Simula sin aplicar
- `validateCorrections()`: Valida correcciones
- `applyCorrections()`: Aplica correcciones
- `generateReport()`: Genera reporte detallado

---

## Tipos de corrección implementados

### 1. Off-Grid Correction

**Problema**: Eventos desviados de la rejilla rítmica.

**Solución**:
- Calcula posición de rejilla más cercana
- Analiza continuidad melódica
- Detecta timing expresivo
- Si no es expresivo, corrige a la rejilla
- Registra justificación completa

**Ejemplo**:
```
Evento en tick 1234
Rejilla más cercana: 1200
Delta: 34 ticks (7.1%)
Continuidad melódica: 85%
→ No es timing expresivo
→ Corregir a 1200
```

### 2. Micro-Gap Correction

**Problema**: Pequeños silencios entre eventos melódicamente continuos.

**Solución**:
- Detecta gaps entre 5-30 ticks
- Analiza continuidad melódica
- Si continuidad es alta, extiende duración
- Elimina silencio artificial

**Ejemplo**:
```
Evento 1: tick 0-480
Evento 2: tick 490-970
Gap: 10 ticks
Continuidad: 90%
→ Extender evento 1 a 490
```

### 3. Duration Correction

**Problema**: Duraciones cero, negativas o anormalmente cortas.

**Solución**:
- Detecta duraciones < 10 ticks
- Calcula duración viable basada en contexto
- Ajusta duración mínima
- Registra justificación

### 4. Cluster Resolution (Parcial)

**Problema**: Múltiples notas simultáneas en instrumentos monofónicos.

**Estado**: Detectado pero no corregido automáticamente (requiere revisión manual).

**Razón**: Alta probabilidad de destruir intención musical.

---

## Sistema de confianza

### Cálculo de confianza

Cada corrección recibe un score de confianza basado en:

1. **Magnitud del problema**: Desviación grande = mayor confianza
2. **Continuidad melódica**: Alta continuidad = mayor confianza
3. **Patrón rítmico**: Patrón claro = mayor confianza
4. **Contexto armónico**: Contexto consistente = mayor confianza
5. **Protecciones**: Human override = no corregir

### Umbrales configurables

```typescript
const CONFIDENCE_GATES = {
  VERY_HIGH: { minScore: 0.9 },
  HIGH: { minScore: 0.75 },
  MEDIUM: { minScore: 0.6 },
  LOW: { minScore: 0 },
};
```

### Decisiones basadas en confianza

- **VERY_HIGH/HIGH**: Corregir automáticamente
- **MEDIUM**: Marcar para revisión
- **LOW**: No corregir

---

## Reporte de autocorrección

### Estructura del reporte

```typescript
interface AutocorrectReport {
  // Resumen
  totalEvents: number;
  issuesDetected: number;
  autoCorrected: number;
  protected: number;
  unchanged: number;
  reviewRequired: number;
  
  // Desglose por tipo
  byIssueType: Record<IssueType, Stats>;
  
  // Desglose por instrumento
  byInstrument: Record<string, Stats>;
  
  // Desglose por compás
  byMeasure: Record<number, Stats>;
  
  // Métricas de calidad
  qualityMetrics: {
    before: QualityMetrics;
    after: QualityMetrics;
    improvement: number;
  };
  
  // Log de decisiones
  decisions: Decision[];
}
```

### Métricas de calidad

- `gridConsistency`: Consistencia con la rejilla rítmica
- `voiceConsistency`: Consistencia de voces
- `melodicContinuity`: Continuidad melódica
- `overallScore`: Puntuación general (0-1)

---

## Integración con UI

### Pestaña SAE

**Botón principal**: `ANALYZE & AUTOCORRECT COMPLETE SCORE`

**Funcionalidades**:
- Ejecución del pipeline completo
- Barra de progreso en tiempo real
- Reporte detallado de resultados
- Botón de reversión

**Estados**:
- Idle: Botón activo
- Running: Barra de progreso visible
- Completed: Reporte visible + botón de reversión

### Flujo de usuario

1. Usuario carga MIDI
2. Construye MMC
3. Va a pestaña SAE
4. Pulsa `ANALYZE & AUTOCORRECT COMPLETE SCORE`
5. Ve progreso en tiempo real
6. Revisa reporte de resultados
7. Acepta o revierte correcciones
8. Exporta resultado

---

## Configuración

### Configuración por defecto

```typescript
const DEFAULT_SAE_CONFIG = {
  minConfidenceForAutoCorrect: 'HIGH',
  protectHumanOverrides: true,
  protectExplicitLocks: true,
  protectSwingPatterns: true,
  protectExpressiveTiming: true,
  enableOffGridCorrection: true,
  enableClusterResolution: true,
  enableMicroGapCorrection: true,
  enableDurationCorrection: true,
  enableDuplicateRemoval: true,
  simulateBeforeApply: true,
  rollbackOnFailure: true,
  validateAfterCorrection: true,
  globalReconciliation: true,
};
```

### Opciones configurables

- **Nivel de confianza mínimo**: VERY_HIGH, HIGH, MEDIUM, LOW
- **Protecciones**: Human overrides, swing, expresividad
- **Correcciones habilitadas**: Off-grid, clusters, micro-gaps, duraciones, duplicados
- **Simulación**: Activar/desactivar simulación antes de aplicar
- **Validación**: Activar/desactivar validación post-corrección
- **Reconciliación**: Activar/desactivar reconciliación global

---

## Trazabilidad

### Transformation History

Cada corrección se registra en el historial de transformaciones:

```typescript
interface TransformationRecord {
  module: 'SAE';
  operation: 'autocorrect';
  field_changed: string;
  value_before: any;
  value_after: any;
  reason: string;
  confidence: number;
  timestamp: number;
}
```

### Explicabilidad

Cada corrección incluye:
- **Reason**: Descripción corta de la corrección
- **Explanation**: Justificación detallada basada en evidencia

**Ejemplo**:
```
Reason: Corregido de 1234 a 1200 (delta: 34 ticks)
Explanation: El evento estaba desviado 34 ticks (7.1%) de la rejilla 
de semicorcheas. La continuidad melódica (85%) y el patrón rítmico 
confirman que es un error de timing, no interpretación expresiva.
```

---

## Limitaciones conocidas

1. **Cluster resolution**: Detectado pero no corregido automáticamente (requiere revisión manual)
2. **Swing detection**: Detectado pero no cuantizado automáticamente
3. **Harmonic context**: Análisis simplificado (no usa análisis armónico completo)
4. **Voice separation**: No implementa separación automática de voces
5. **Tempo changes**: No detecta rubato automáticamente
6. **Form analysis**: No analiza estructura formal de la obra

---

## Próximos pasos (opcionales)

1. **Cluster resolution avanzado**: Algoritmos para resolver clusters automáticamente
2. **Swing quantization**: Cuantización respetando patrones de swing
3. **Harmonic analysis**: Integración con análisis armónico completo
4. **Voice separation**: Separación automática de voces polifónicas
5. **Tempo analysis**: Detección de rubato y acelerandos/ritardandos
6. **Form analysis**: Detección de estructura formal (A-B-A, sonata, etc.)
7. **Machine learning**: Modelos entrenados para detección de patrones
8. **Batch processing**: Procesamiento por lotes de múltiples archivos

---

## Verificaciones

### Build
```
✓ vite build completado sin errores
✓ 1394 módulos transformados
✓ TypeScript type-check pasado
```

### Integración
```
✓ SAE integrado con MMC existente
✓ SAE integrado con Score & Parts
✓ UI funcional con progreso en tiempo real
✓ Reversión funcional
```

### Regresiones
```
✓ Ninguna funcionalidad preexistente eliminada
✓ MMC v1.0 intacta
✓ Score & Parts intacto
✓ Exportación MIDI funcional
✓ Exportación MusicXML funcional
```

---

## Uso

### Desde la UI

1. Cargar proyecto MIDI
2. Ir a pestaña **MMC** → Construir MMC
3. Ir a pestaña **SAE**
4. Pulsar **ANALYZE & AUTOCORRECT COMPLETE SCORE**
5. Esperar completado del pipeline
6. Revisar reporte de resultados
7. Aceptar o revertir correcciones
8. Exportar resultado

### Desde código

```typescript
import { runSovereignAutocorrection } from './sae';

const result = await runSovereignAutocorrection(
  mmcProject,
  config, // opcional
  (progress) => {
    console.log(`${progress.phase}: ${progress.progress}%`);
  }
);

if (result.success) {
  console.log(`Corregidas: ${result.report?.autoCorrected}`);
  console.log(`Requieren revisión: ${result.report?.reviewRequired}`);
  
  // Usar correctedProject
  const corrected = result.correctedProject;
}
```

---

## Conclusión

El **Sovereign Autocorrection Engine (SAE)** ha sido implementado exitosamente como un motor de corrección autónoma que:

✓ Analiza la obra completa en contexto
✓ Detecta incidencias con evidencia
✓ Corrige automáticamente con confianza suficiente
✓ Preserva la intención musical
✓ Explica cada corrección
✓ Permite reversión completa
✓ Se integra con MMC y Score & Parts
✓ Mantiene trazabilidad total

**Estado final**: IMPLEMENTADO ✓

---

**Implementado por**: Asistente de desarrollo
**Fecha**: 2026
**Versión**: SAE v1.0.0
**Proyecto**: sae-space-ai/midiextremplus
