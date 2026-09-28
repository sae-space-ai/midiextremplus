# Ampliación: Individual Parts & Full Conductor Score

## Resumen

Esta ampliación añade la capacidad de extraer **particellas individuales** y generar el **Full Conductor Score** desde la MMC (Matriz Maestra de Conversión) validada, manteniendo sincronización absoluta y trazabilidad completa.

**Estado: IMPLEMENTADO ✓**

---

## Arquitectura

### Principios aplicados

1. **Single Source of Truth**: La MMC sigue siendo la fuente canónica
2. **Sincronización absoluta**: Compás N de particella = Compás N del Full Score
3. **No destructivo**: No se modifican eventos musicales durante la extracción
4. **Trazabilidad**: Cada elemento de partitura se rastrea hasta su evento MMC
5. **Orden orquestal**: Instrumentos ordenados según plantilla estándar
6. **Transposición correcta**: Concert pitch en MMC, written pitch en notación
7. **Silencios preservados**: Compases vacíos mantienen su posición temporal
8. **Multi-measure rests**: Silencios consecutivos se consolidan cuando corresponde

### Estructura de archivos

```
src/score/
├── types.ts                 # Tipos del Score Model
├── orchestral-order.ts      # Motor de orden orquestal
├── part-extractor.ts        # Extractor de particellas individuales
├── score-assembler.ts       # Ensamblador del Full Conductor Score
├── musicxml.ts              # Exportador MusicXML
├── tests.ts                 # 10 tests obligatorios
└── index.ts                 # API pública
```

---

## Módulos implementados

### 1. Score Model (`types.ts`)

**Propósito**: Capa lógica entre MMC y renderizado/exportación.

**Tipos principales**:
- `Score`: Partitura completa con todos los instrumentos
- `IndividualPart`: Particella de un solo instrumento
- `ScoreInstrument`: Instrumento con metadatos de notación
- `ScoreStaff`: Pentagrama con compases y eventos
- `ScoreMeasure`: Compás con voces y eventos
- `ScoreEvent`: Evento de partitura (nota o silencio)
- `ScoreMetadata`: Metadatos de la partitura
- `RehearsalStructure`: Estructura formal (segno, coda, etc.)

**Características**:
- Cada evento conserva referencia al evento MMC original
- Eventos derivados (silencios generados) marcados con `is_derived: true`
- Soporte para articulaciones, dinámicas, ligaduras, etc.
- Transposición instrumental (concert pitch vs written pitch)

### 2. Orchestral Order Engine (`orchestral-order.ts`)

**Propósito**: Ordena instrumentos según plantilla orquestal estándar.

**Plantillas soportadas**:
- `symphonic_orchestra`: Orquesta sinfónica completa
- `wind_orchestra`: Banda sinfónica
- `big_band`: Big band de jazz
- `chamber_ensemble`: Ensemble de cámara
- `band`: Banda
- `custom`: Personalizada

**Orden estándar (orquesta sinfónica)**:
```
1. Woodwinds (Flauta, Oboe, Clarinete, Fagot)
2. Brass (Trompa, Trompeta, Trombón, Tuba)
3. Percussion (Timpani, Percusión)
4. Keyboards (Arpa, Piano)
5. Strings (Violín I, Violín II, Viola, Violonchelo, Contrabajo)
```

**Funciones**:
- `sortInstrumentsByOrchestralOrder()`: Ordena instrumentos
- `groupInstruments()`: Agrupa por familias
- `detectEnsembleTemplate()`: Detecta plantilla automáticamente
- `getGroupBracketType()`: Obtiene tipo de bracket (brace/bracket)

### 3. Part Extractor (`part-extractor.ts`)

**Propósito**: Extrae particellas individuales desde la MMC.

**Responsabilidades**:
- Seleccionar instrumento/voz
- Extraer eventos MMC correspondientes
- Preservar estructura global (compases, tempo, tonalidad)
- Insertar silencios en compases vacíos
- Aplicar transposición escrita cuando corresponda
- Consolidar multi-measure rests
- Mantener marcas de ensayo y estructura formal

**Características**:
- Detecta clef automáticamente según instrumento
- Genera abreviaturas de nombre de instrumento
- Identifica instrumentos transpositores
- Marca instrumentos que requieren revisión manual
- Preserva posición temporal absoluta

**Regla crítica**: No elimina compases de espera reales. Si un instrumento no toca durante 8 compases, esos 8 compases se conservan como silencios.

### 4. Score Assembler (`score-assembler.ts`)

**Propósito**: Ensambla el Full Conductor Score completo.

**Responsabilidades**:
- Recibir eventos MMC validados
- Agrupar instrumentos por familias
- Ordenarlos según plantilla orquestal
- Construir compases sincronizados
- Incorporar metadatos y estructura formal
- Preparar representación de partitura

**Características**:
- Todos los instrumentos comparten exactamente la misma estructura temporal
- Soporte para brackets y braces visuales
- Detección automática de plantilla orquestal
- Integración con Part Extractor para consistencia

### 5. MusicXML Exporter (`musicxml.ts`)

**Propósito**: Genera archivos MusicXML estándar para intercambio.

**Características**:
- MusicXML 4.0 Partwise format
- Soporte completo para:
  - Metadatos (título, compositor, copyright)
  - Tempo y cambios de tempo
  - Tonality y cambios de tonalidad
  - Time signature y cambios de compás
  - Articulaciones y dinámicas
  - Multi-measure rests
  - Transposición instrumental
- Compatible con MuseScore, Dorico, Sibelius, Finale
- Descarga directa desde el navegador

**Funciones**:
- `exportScoreToMusicXML()`: Exporta Full Score
- `exportPartToMusicXML()`: Exporta particella individual
- `downloadMusicXML()`: Descarga archivo al navegador

---

## Flujo de trabajo

```
1. Usuario carga MIDI
   ↓
2. MidiProject → MMC (builder.ts)
   ↓
3. MMC → Pipeline jerárquico (hierarchy.ts)
   ↓
4. MMC validada
   ↓
5. MMC → Score + Parts (score-assembler.ts + part-extractor.ts)
   ↓
6. Score/Parts → MusicXML (musicxml.ts)
   ↓
7. Archivos MusicXML descargados
```

---

## Sincronización absoluta

**Propiedad crítica**:

```
COMPÁS N DEL CLARINETE
= COMPÁS N DE LA TROMPETA
= COMPÁS N DEL VIOLÍN
= COMPÁS N DEL FULL SCORE
```

**Implementación**:
- Todas las particellas y el score derivan de la misma MMC
- Cada compás tiene el mismo número en todas las salidas
- Los silencios mantienen la posición temporal
- No se permiten desplazamientos derivados de la extracción

---

## Transposición instrumental

**Distingue obligatoriamente**:

### Concert Pitch (MMC)
- Altura musical canónica
- Usada para análisis y procesamiento
- No se modifica durante la extracción

### Written Pitch (Notación)
- Altura escrita para el instrumento
- Aplica transposición automática
- Ejemplo: Clarinete en Sib → written = concert + 2 semitonos

**Instrumentos transpositores soportados**:
- Clarinete en Sib/La
- Trompeta en Sib/Do
- Trompa en Fa
- Saxofones (Sib, Mib)
- Flautín (octava arriba)
- Contrabajo (octava abajo)

---

## Silencios y multi-measure rests

**Regla**: No eliminar compases de espera reales.

**Comportamiento**:
- Compás vacío → silencio de duración completa
- 2+ silencios consecutivos → multi-measure rest
- Multi-measure rest se visualiza como número (ej: "8")
- Internamente siguen siendo compases sincronizados

**Ejemplo**:
```
Compás 5-12: Flauta no toca
→ Se muestra como "8" (multi-measure rest)
→ Internamente son 8 compases con silencios
→ Sincronización mantenida con otros instrumentos
```

---

## Identificación de instrumentos

**No depende exclusivamente del nombre textual**.

**Fuentes de información**:
1. Track name
2. MIDI program
3. MIDI channel
4. GM program
5. MMC instrument_id
6. MMC instrument_family
7. Register (rango de alturas)
8. Musical behavior

**Si existe ambigüedad**:
- Marca: `INSTRUMENT_REVIEW_REQUIRED`
- Permite corrección humana
- No inventa información

---

## Tests obligatorios

**10 tests implementados** (todos pasan ✓):

1. **TEST 01**: Extraer Clarinet 1 → sólo aparecen sus notas
2. **TEST 02**: Silencios mantienen posición de compases
3. **TEST 03**: Compás N de particella = Compás N del Full Score
4. **TEST 04**: Instrumento transpositor conserva concert pitch en MMC y written pitch correcto
5. **TEST 05**: Full Score contiene todos los instrumentos esperados
6. **TEST 06**: Orden orquestal correcto
7. **TEST 07**: No aparecen notas nuevas durante extracción
8. **TEST 08**: No desaparecen notas válidas
9. **TEST 09**: Clusters sospechosos no se exportan silenciosamente como acordes
10. **TEST 10**: MusicXML generado tiene estructura válida

---

## Integración con UI

### Pestaña "Score & Parts"

**Botones principales**:
- **Extraer Score y Parts**: Construye Full Score y todas las particellas
- **Export Full Score**: Descarga MusicXML del score completo
- **Export All Parts**: Descarga todas las particellas individualmente
- **Tests Score**: Ejecuta los 10 tests obligatorios

**Panel de estadísticas**:
- Número de instrumentos
- Número de compases
- Total de eventos
- Eventos derivados (silencios generados)
- Instrumentos que requieren revisión

**Lista de particellas**:
- Nombre del instrumento
- Número de notas y compases
- Indicador de revisión requerida
- Botón de exportación individual

---

## Relación con MMC

### Derivación desde MMC

**Todas las particellas y el score derivan de la misma MMC**:

```
MMC Event (event_id: "mmc_123")
  ↓
Score Event (mmc_event_id: "mmc_123")
  ↓
MusicXML <note> element
```

**Trazabilidad completa**:
- Cada evento de partitura tiene `mmc_event_id`
- Permite rastrear hasta el evento MIDI original
- Facilita auditoría y depuración

### Reglas anti-cluster

**La extracción se realiza DESPUÉS de la validación anti-cluster**:

- Si `cluster_candidate = true` y `cluster_validated = false`:
  - Se marca como `MMC_REVIEW_REQUIRED`
  - No se exporta automáticamente como acorde válido
  - Requiere resolución manual antes de exportar

### Continuidad melódica

**La particella preserva resultados del Melodic Continuity Engine**:

- No introduce silencios adicionales durante extracción
- Conserva micro-gaps clasificados
- Mantiene ligaduras y articulaciones

---

## Formato de exportación

### MusicXML

**Ventajas**:
- Estándar abierto para intercambio de partituras
- Compatible con todos los editores principales
- Preserva toda la información musical
- Soporta transposición y notación compleja

**Estructura generada**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ...>
<score-partwise version="4.0">
  <work>
    <work-title>Nombre de la obra</work-title>
  </work>
  <identification>
    <creator type="composer">Compositor</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Flute</part-name>
    </score-part>
    ...
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>...</attributes>
      <note>...</note>
    </measure>
    ...
  </part>
</score-partwise>
```

### Nombres de archivos

**Deterministas y consistentes**:
```
ProjectName_FULL_SCORE.musicxml
ProjectName_Flute1.musicxml
ProjectName_Clarinet1.musicxml
ProjectName_Trumpet1.musicxml
ProjectName_ViolinI.musicxml
```

---

## Limitaciones conocidas

1. **Renderizado visual**: No incluye renderizado de partitura en pantalla (requiere biblioteca adicional como VexFlow o OpenSheetMusicDisplay)

2. **PDF/SVG**: No implementado (requiere motor de renderizado gráfico)

3. **Marcas de ensayo automáticas**: No detecta automáticamente secciones A/B/C (requiere análisis estructural avanzado)

4. **Ligaduras y slur**: Detección básica, puede requerir ajuste manual

5. **Voces múltiples**: Soporte limitado a una voz por pentagrama (extensible)

6. **Letra y análisis**: No soporta texto lírico ni análisis armónico completo

---

## Próximos pasos (opcionales)

1. **Renderizado visual**: Integrar VexFlow o OpenSheetMusicDisplay para previsualización
2. **Exportación PDF**: Implementar renderizado a PDF usando jsPDF o similar
3. **Detección de secciones**: Algoritmo para identificar automáticamente A/B/C, estribillo, etc.
4. **Edición de partitura**: Permitir edición directa de la partitura generada
5. **Importación MusicXML**: Capacidad de importar partituras existentes
6. **Análisis armónico**: Integrar análisis de acordes y funciones armónicas
7. **Partitura condensada**: Generar partitura reducida para piano

---

## Verificaciones

### Build
```
✓ vite build completado sin errores
✓ 1388 módulos transformados
✓ TypeScript type-check pasado
```

### Tests Score & Parts
```
✓ TEST 01: Extraer particella individual — PASA
✓ TEST 02: Silencios mantienen posición — PASA
✓ TEST 03: Sincronización de compases — PASA
✓ TEST 04: Instrumento transpositor — PASA
✓ TEST 05: Full Score contiene todos — PASA
✓ TEST 06: Orden orquestal — PASA
✓ TEST 07: No aparecen notas nuevas — PASA
✓ TEST 08: No desaparecen notas válidas — PASA
✓ TEST 09: Clusters sospechosos — PASA
✓ TEST 10: MusicXML válido — PASA

Resultado: 10/10 tests aprobados
```

### Regresiones
- **Ninguna funcionalidad preexistente eliminada**
- **Ninguna ruta rota**
- **Ninguna importación rota**
- **Todos los módulos MMC continúan funcionando**
- **UI existente preservada**

---

## Uso

### Desde la UI

1. Cargar proyecto MIDI
2. Ir a pestaña **MMC** → Construir MMC
3. Ir a pestaña **Score & Parts**
4. Pulsar **Extraer Score y Parts**
5. Revisar estadísticas y advertencias
6. Exportar Full Score o particellas individuales
7. Abrir archivos MusicXML en MuseScore/Dorico/Sibelius

### Desde código

```typescript
import { extractScoreAndParts, exportFullScoreToMusicXML } from './score';

const metadata = {
  title: 'Mi Obra',
  composer: 'Compositor',
  // ...
};

const structure = {
  segno_measure: null,
  coda_measure: null,
  // ...
};

const result = extractScoreAndParts(mmcProject, metadata, structure);

// result.score: Full Conductor Score
// result.parts: Array de IndividualPart

const musicxml = exportFullScoreToMusicXML(result.score);
```

---

## Conclusión

La ampliación **Individual Parts & Full Conductor Score** ha sido implementada exitosamente, permitiendo extraer particellas individuales y generar el score completo del director desde la MMC validada.

**Principios cumplidos**:
✓ Sincronización absoluta entre particellas y score
✓ Derivación desde única fuente (MMC)
✓ No destructivo
✓ Trazabilidad completa
✓ Orden orquestal configurable
✓ Transposición instrumental correcta
✓ Silencios preservados
✓ MusicXML estándar
✓ Tests obligatorios (10/10 pasan)
✓ Build exitoso
✓ Sin regresiones

**Estado final**: IMPLEMENTADO ✓

---

**Implementado por**: Asistente de desarrollo
**Fecha**: 2026
**Versión**: Score & Parts v1.0.0
**Proyecto**: sae-space-ai/midiextremplus
