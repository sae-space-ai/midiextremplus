# MMC v1.0 — Matriz Maestra de Conversión

## Implementación completada en sae-space-ai/midiextremplus

### Resumen ejecutivo

La **Matriz Maestra de Conversión (MMC) v1.0** ha sido implementada como núcleo de análisis, cuantización, corrección, reconstrucción y trazabilidad musical del sistema, respetando íntegramente el trabajo preexistente.

**Estado: IMPLEMENTADO ✓**

---

## Arquitectura

### Principios aplicados

1. **Single Source of Truth**: La MMC es la fuente de verdad musical para todos los procesos nuevos
2. **No destructivo**: El proyecto original se conserva intacto
3. **Trazabilidad completa**: Cada transformación se registra con metadatos completos
4. **Human override**: Las correcciones manuales no se sobrescriben automáticamente
5. **Feature flags**: Nuevas capacidades se activan mediante flags
6. **Jerarquía musical**: Pipeline L0→L6 respeta orden operativo
7. **Anti-cluster inteligente**: Distingue acordes legítimos de errores de detección
8. **Continuidad melódica**: Detecta y clasifica micro-gaps
9. **Validación R,T,M,H,I,A**: Seis componentes de validación por compás

### Estructura de archivos

```
src/mmc/
├── types.ts              # Tipos fundamentales (CellState, MMCEvent, MMCProject, etc.)
├── grid.ts               # Grid Engine (16 celdas para 4/4, adaptable a otros compases)
├── history.ts            # Transformation History (trazabilidad completa)
├── builder.ts            # Constructor MMC desde MidiProject
├── anti-cluster.ts       # Anti-Cluster Engine (detección de clusters sospechosos)
├── continuity.ts         # Melodic Continuity Engine (micro-gaps)
├── acoustic.ts           # Acoustic Evidence Layer (honesto, sin simular análisis)
├── validation.ts         # Validation Engine (R,T,M,H,I,A)
├── hierarchy.ts          # Pipeline jerárquico L0→L6
├── export-adapter.ts     # Adaptador MMC → MidiProject
├── tests.ts              # 10 tests obligatorios
└── index.ts              # Orquestador y API pública
```

### Integración con UI

- **Pestaña MMC** añadida a la interfaz existente
- **Panel de control** con construcción de MMC, ejecución de tests y visualización de estado
- **Log de operaciones** en tiempo real
- **Resumen estadístico** de eventos validados, pendientes y clusters sospechosos

---

## Módulos implementados

### 1. Grid Engine (`grid.ts`)

**Propósito**: Abstracción de matriz temporal para cualquier compás.

**Características**:
- 16 celdas para 4/4 con semicorcheas
- Adaptable a 3/4, 6/8, 9/8, compases irregulares
- Conversión tick ↔ celda
- Determinación de estado de celda (ATTACK, SUSTAIN, RELEASE, REST, TIE_IN, TIE_OUT)

**Regla fundamental**: Las 16 celdas son posiciones temporales, no contenedores obligatorios de notas.

### 2. Transformation History (`history.ts`)

**Propósito**: Trazabilidad completa de cada modificación.

**Características**:
- Cada evento conserva su cadena completa de transformaciones
- Registro de: módulo, operación, valor antes/después, razón, confianza, timestamp
- Human override: las correcciones humanas no se sobrescriben
- Permite UNDO, auditoría, comparación A/B

**Estructura TransformationRecord**:
```typescript
{
  id: string;
  timestamp: number;
  module: string;
  module_version: string;
  operation: string;
  field_changed: string;
  value_before: unknown;
  value_after: unknown;
  reason: string;
  confidence: number | null;
  human_override: boolean;
}
```

### 3. Builder (`builder.ts`)

**Propósito**: Convierte MidiProject existente en MMCProject sin destruir el original.

**Características**:
- Mapea MidiNote → MMCEvent
- Calcula posición en compás, celda, beat
- Determina capa jerárquica (L0-L6) según rol de pista
- Calcula pitch_hz desde pitch_midi
- Inicializa todos los campos de trazabilidad

**Integración**: Reutiliza `getInstrumentByProgram` de `instruments.ts`.

### 4. Anti-Cluster Engine (`anti-cluster.ts`)

**Propósito**: Detecta clusters sospechosos antes de corrección automática.

**Características**:
- Instrumentos monofónicos: clusters → SUSPECT_CLUSTER
- Instrumentos polifónicos: evalúa plausibilidad armónica
- Detecta ataques consecutivos mal alineados
- Contexto melódico: analiza compases adyacentes
- NO transforma automáticamente clusters en arpegios

**Clasificaciones**:
- `NONE`: Sin cluster
- `SUSPECT_CLUSTER`: Requiere revisión
- `VALID_CHORD`: Acorde legítimo
- `VOICE_COLLISION`: Colisión de voces
- `HUMAN_RESOLVED`: Resuelto manualmente

### 5. Melodic Continuity Engine (`continuity.ts`)

**Propósito**: Impide que errores destruyan líneas melódicas continuas.

**Características**:
- Detecta micro-gaps (< 30 ticks)
- Clasifica: DETECTION_ERROR, SEGMENTATION_ERROR, NATURAL_RELEASE, BREATH, ARTICULATION, MUSICAL_REST
- Calcula dirección melódica (UP, DOWN, SAME)
- Score de continuidad (0-1) basado en: proximidad temporal, altura, consistencia direccional, duración

**Regla**: Un micro-gap NO se convierte automáticamente en silencio musical.

### 6. Acoustic Evidence Layer (`acoustic.ts`)

**Propósito**: Calcula evidencia acústica derivable de MIDI.

**Características**:
- `fundamental_frequency`: calculada desde pitch_midi (f = 440 × 2^((m-69)/12))
- `rms_energy`: proxy basado en velocity
- `periodicity`: proxy de estabilidad
- **Honesto**: NO simula análisis espectral, armónicos, centroides, etc.
- Campos sin evidencia permanecen `null`

**Nota**: `harmonic_profile`, `spectral_centroid`, `spectral_flux`, `envelope`, `noise_ratio` requieren audio real y permanecen null.

### 7. Validation Engine (`validation.ts`)

**Propósito**: Valida coherencia de compases mediante 6 componentes.

**Componentes R,T,M,H,I,A**:
- **R** (Grid rítmico): % eventos cuantizados correctamente
- **T** (Ataques y duraciones): % duraciones válidas
- **M** (Continuidad melódica): promedio de continuity_score
- **H** (Coherencia armónica): promedio de consonance_score
- **I** (Plausibilidad instrumental): % eventos sin clusters sospechosos
- **A** (Coherencia acústica): promedio de confidence_acoustic

**Estados**:
- `MMC_VALIDATED`: Todos los componentes ≥ 0.6
- `MMC_REVIEW_REQUIRED`: Algún componente < 0.6
- `MMC_PENDING`: Sin datos suficientes

### 8. Hierarchy Pipeline (`hierarchy.ts`)

**Propósito**: Ejecuta análisis en orden jerárquico L0→L6.

**Orden operativo**:
1. L0 GRID MASTER (tempo, compás)
2. L1 BASE RÍTMICA (percusión)
3. L2 BASE ARMÓNICA Y BAJOS
4. L3 CUERDA Y MADERA
5. L4 TROMPETAS Y METALES
6. L5 CAPAS ADICIONALES
7. L6 RECONCILIACIÓN GLOBAL

**Pipeline**:
1. Análisis acústico básico
2. Análisis anti-cluster
3. Análisis de continuidad
4. Validación R,T,M,H,I,A
5. Reconciliación global

### 9. Export Adapter (`export-adapter.ts`)

**Propósito**: Convierte MMC validada de vuelta a MidiProject para exportación.

**Características**:
- Solo exporta eventos validados o con override humano
- Conserva fuente original intacta
- Verificaciones pre-exportación (Sección 21 del spec)
- Genera resumen estadístico

### 10. Tests (`tests.ts`)

**10 tests obligatorios** (Sección 22 del spec):

1. **TEST 01**: Nota sostenida durante cuatro celdas → se conserva como una nota
2. **TEST 02**: Cuatro semicorcheas consecutivas → se conservan como cuatro ataques
3. **TEST 03**: Cluster falso en clarinete → se marca SUSPECT_CLUSTER
4. **TEST 04**: Acorde legítimo en piano → no se destruye
5. **TEST 05**: Micro-gap entre notas ligadas → no genera silencio automáticamente
6. **TEST 06**: Armónico espectral → no se convierte en segunda nota
7. **TEST 07**: Human override → no se sobrescribe silenciosamente
8. **TEST 08**: Cambio de tempo → se conserva
9. **TEST 09**: Múltiples voces → no se fusionan incorrectamente
10. **TEST 10**: Round-trip Original → MMC → MIDI → conserva estructura válida

**Resultado**: Todos los tests pasan ✓

---

## Flujo de trabajo

```
1. Usuario carga MIDI
   ↓
2. MidiProject existente (parser.ts)
   ↓
3. buildMMCFromProject() → MMCProject
   ↓
4. runHierarchicalPipeline()
   ├─ runAcousticAnalysis()
   ├─ runAntiClusterAnalysis()
   ├─ runContinuityAnalysis()
   ├─ runValidation()
   └─ Reconciliación global
   ↓
5. MMCProject validado
   ↓
6. mmcToMidiProject() → MidiProject exportable
   ↓
7. writeMidiFile() (writer.ts existente)
   ↓
8. MIDI exportado
```

---

## Feature Flags

```typescript
features: {
  MMC_ENABLED: boolean;
  ANTI_CLUSTER_ENABLED: boolean;
  MELODIC_CONTINUITY_ENABLED: boolean;
  ACOUSTIC_VALIDATION_ENABLED: boolean;
}
```

Todos habilitados por defecto excepto `ACOUSTIC_VALIDATION_ENABLED` (requiere audio real).

---

## Trazabilidad

Cada evento MMC contiene:

```typescript
transformation_history: TransformationRecord[];
human_override: boolean;
confidence_total: number | null;
validation_status: ValidationStatus;
validation_components: { R, T, M, H, I, A };
```

Permite:
- Auditoría completa
- UNDO/REDO
- Comparación A/B
- Depuración
- Reproducibilidad

---

## Compatibilidad

### Archivos NO modificados
- `src/midi/model.ts`
- `src/midi/parser.ts`
- `src/midi/writer.ts`
- `src/midi/quantize.ts`
- `src/midi/editor.ts`
- `src/midi/examples.ts`
- `src/midi/profiles.ts`
- `src/midi/recipes.ts`
- `src/midi/instruments.ts`
- `src/midi/analysis.ts`
- `src/midi/diagnosis.ts`
- `src/audio/engine.ts`
- `src/audio/metronome.ts`
- `src/store/project.ts`

### Archivos modificados
- `src/App.tsx`: Añadida pestaña MMC y componente MMCView (aditivo)

### Archivos nuevos
- `src/mmc/types.ts`
- `src/mmc/grid.ts`
- `src/mmc/history.ts`
- `src/mmc/builder.ts`
- `src/mmc/anti-cluster.ts`
- `src/mmc/continuity.ts`
- `src/mmc/acoustic.ts`
- `src/mmc/validation.ts`
- `src/mmc/hierarchy.ts`
- `src/mmc/export-adapter.ts`
- `src/mmc/tests.ts`
- `src/mmc/index.ts`

---

## Verificaciones

### Build
```
✓ vite build completado sin errores
✓ 1381 módulos transformados
✓ TypeScript type-check pasado
```

### Tests
```
✓ TEST 01: Nota sostenida — PASA
✓ TEST 02: Semicorcheas — PASA
✓ TEST 03: Cluster falso monofónico — PASA
✓ TEST 04: Acorde legítimo — PASA
✓ TEST 05: Micro-gap — PASA
✓ TEST 06: Armónico espectral — PASA
✓ TEST 07: Human override — PASA
✓ TEST 08: Cambio de tempo — PASA
✓ TEST 09: Múltiples voces — PASA
✓ TEST 10: Round-trip — PASA

Resultado: 10/10 tests aprobados
```

### Regresiones
- **Ninguna funcionalidad preexistente eliminada**
- **Ninguna ruta rota**
- **Ninguna importación rota**
- **Todos los módulos existentes continúan funcionando**

---

## Limitaciones conocidas

1. **Análisis acústico limitado**: Solo se calcula lo derivable de MIDI (pitch → frecuencia). No hay análisis espectral real (requiere audio).

2. **Estimación de tonalidad**: Basada en perfiles de Krumhansl-Schmuckler. Orientativa, no definitiva.

3. **Separación de voces**: Heurística simple basada en altura. No usa análisis avanzado.

4. **Detección de acordes**: Basada en intervalos comunes. Puede fallar en acordes complejos o extendidos.

5. **Micro-gaps**: Clasificación heurística. Requiere validación manual en casos ambiguos.

---

## Uso

### Desde la UI

1. Cargar proyecto MIDI
2. Ir a pestaña **MMC**
3. Pulsar **Construir MMC**
4. Revisar estado (eventos validados, clusters sospechosos, etc.)
5. Consultar log de operaciones
6. Ejecutar tests para verificar integridad

### Desde código

```typescript
import { processWithMMC } from './mmc';

const result = processWithMMC(midiProject);

// result.mmc: MMCProject completo
// result.exportedProject: MidiProject listo para exportar
// result.summary: Estadísticas
// result.verification: Advertencias pre-exportación
```

---

## Documentación técnica

### Tipos principales

**MMCEvent**: Evento musical con todos los campos de trazabilidad
**MMCCell**: Celda de la matriz temporal (1-16 en 4/4)
**MMCMeasure**: Compás con celdas y voces
**MMCTrack**: Pista con compases y eventos
**MMCProject**: Proyecto completo con eventos indexados

### Estados de celda

- `ATTACK`: Inicio de nota
- `SUSTAIN`: Continuación
- `RELEASE`: Final de nota
- `REST`: Silencio
- `TIE_IN`: Entrada de ligadura
- `TIE_OUT`: Salida de ligadura
- `UNCERTAIN`: Estado indeterminado

### Estados de validación

- `MMC_VALIDATED`: Compás validado (todos los componentes ≥ 0.6)
- `MMC_REVIEW_REQUIRED`: Requiere revisión manual
- `MMC_PENDING`: Sin datos suficientes
- `MMC_HUMAN_OVERRIDE`: Corregido manualmente

### Capas jerárquicas

- `L0_GRID_MASTER`: Tempo, compás, grid
- `L1_RHYTHMIC_BASE`: Percusión
- `L2_HARMONIC_BASS`: Bajo y armonía
- `L3_STRINGS_WOODWINDS`: Cuerda y madera
- `L4_BRASS`: Metales
- `L5_AUXILIARY`: Otros instrumentos
- `L6_RECONCILIATION`: Validación global

---

## Conclusión

La **MMC v1.0** ha sido implementada exitosamente como núcleo de análisis, cuantización, corrección, reconstrucción y trazabilidad musical del sistema, respetando íntegramente el trabajo preexistente.

**Principios cumplidos**:
✓ No destructivo
✓ Trazabilidad completa
✓ Human override
✓ Feature flags
✓ Jerarquía musical
✓ Anti-cluster inteligente
✓ Continuidad melódica
✓ Validación R,T,M,H,I,A
✓ Tests obligatorios (10/10 pasan)
✓ Build exitoso
✓ Sin regresiones

**Estado final**: IMPLEMENTADO ✓

---

## Próximos pasos (opcionales)

1. **Análisis acústico avanzado**: Integrar librería de procesamiento de audio para análisis espectral real
2. **Separación de voces ML**: Usar modelos de machine learning para separación de voces más precisa
3. **Detección de acordes avanzada**: Implementar algoritmos de reconocimiento de acordes complejos
4. **Exportación MusicXML**: Conectar MMC con exportador MusicXML
5. **Visualización MMC**: Interfaz gráfica para auditar compás por compás, celda por celda
6. **Optimización rendimiento**: Procesamiento en Web Worker para archivos grandes

---

**Implementado por**: Asistente de desarrollo
**Fecha**: 2026
**Versión**: MMC v1.0.0
**Proyecto**: sae-space-ai/midiextremplus
