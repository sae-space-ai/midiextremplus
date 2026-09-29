# Exportación MIDI Completa - Documentación

## Resumen

Se ha implementado la **exportación MIDI completa obligatoria** como parte final de todo proceso en MIDIEXTREMPLUS. El sistema ahora genera automáticamente:

1. **Master MIDI Canónico** - Proyecto completo con todas las correcciones
2. **Score Conductor Completo** - MIDI multitrack con todas las partes
3. **Particellas MIDI Individuales** - Un archivo por instrumento
4. **Manifest de Correspondencias** - JSON con mapeo pista/instrumento/canal/programa

**Estado: ✅ IMPLEMENTADO**

---

## Arquitectura

### Nuevo Módulo: `src/export/`

```
src/export/
├── midi-export.ts    # Motor de exportación MIDI
└── index.ts          # API pública
```

---

## Flujo de Exportación

```
Usuario pulsa "Exportar MIDI Completo"
↓
Sistema verifica que exista extractionResult
↓
Si no existe:
  → Ejecuta pipeline completo automáticamente
  → Genera MMC, SAE, Score Model, Partes
↓
Genera Master MIDI Canónico
↓
Genera Score Conductor Completo
↓
Genera MIDI de cada particella
↓
Genera Manifest de correspondencias
↓
Valida exportación (9 checks)
↓
Descarga todos los archivos
↓
Muestra resultado de validación en UI
```

---

## Archivos Generados

### 1. Master MIDI Canónico
**Nombre**: `{projectName}_MASTER.mid`

**Contenido**:
- Todas las pistas del proyecto
- Tempo map completo
- Time signatures
- Todas las notas con correcciones aplicadas
- Controladores y programas MIDI
- Posiciones temporales absolutas

**Propósito**: Representación completa y canónica de la obra validada.

### 2. Score Conductor Completo
**Nombre**: `{projectName}_SCORE_CONDUCTOR_COMPLETO.mid`

**Contenido**:
- Todas las pistas separadas por instrumento
- Nombres descriptivos de pista
- Sincronización perfecta entre partes
- Metadata de instrumento por pista

**Propósito**: Partitura completa del director para referencia o importación en DAW.

### 3. Particellas MIDI Individuales
**Nombre**: `{NN}_{InstrumentName}.mid`

**Ejemplos**:
```
01_Violin.mid
02_Viola.mid
03_Cello.mid
04_Contrabass.mid
05_Bassoon.mid
06_Clarinet.mid
07_Oboe.mid
08_Drums.mid
```

**Contenido de cada particella**:
- **Solo** la información del instrumento correspondiente
- Tempo map completo (para sincronización)
- Time signatures
- Posición temporal absoluta (no desplazada al inicio)
- Notas del instrumento
- Duraciones y articulaciones
- Velocity y dinámica
- Silencios reales (compases de espera)
- Programa MIDI del instrumento
- Canal MIDI asignado

**Propósito**: Particella individual para cada músico, lista para importar en notación o DAW.

### 4. Manifest de Correspondencias
**Nombre**: `{projectName}_MANIFEST.json`

**Estructura**:
```json
{
  "projectId": "abc123",
  "projectName": "Sinfonía No. 5",
  "timestamp": 1234567890,
  "totalParts": 8,
  "tracks": [
    {
      "trackId": 0,
      "trackName": "Violin",
      "instrumentName": "Violin",
      "midiChannel": 0,
      "midiProgram": 40,
      "partFileName": "01_Violin.mid",
      "noteCount": 1234,
      "duration": 180.5
    },
    ...
  ]
}
```

**Propósito**: Documentación de correspondencias para verificación y auditoría.

---

## Validación Pre-Exportación

Antes de entregar los archivos, el sistema ejecuta **9 checks de validación**:

### 1. PPQ Consistency
**Verifica**: Que todas las salidas usen el mismo PPQ (pulses per quarter note)
**Mensaje**: `PPQ: 480`

### 2. Tempo Map Consistency
**Verifica**: Que el mapa de tempo esté presente y sea consistente
**Mensaje**: `3 tempo changes`

### 3. Time Signature Consistency
**Verifica**: Que el mapa métrico esté presente
**Mensaje**: `2 time signatures`

### 4. Duration Consistency
**Verifica**: Que la longitud total de la obra sea consistente
**Mensaje**: `Total ticks: 46080`

### 5. Track/Instrument Correspondence
**Verifica**: Que cada pista tenga su instrumento correspondiente
**Mensaje**: `All tracks matched` o `Some tracks missing`

### 6. No Duplicate Notes
**Verifica**: Ausencia de notas duplicadas en la exportación
**Mensaje**: `No duplicates` o `5 duplicates found`

### 7. No Hanging Notes
**Verifica**: Que todas las notas tengan Note-Off correspondiente
**Mensaje**: `All notes closed` o `3 hanging notes`

### 8. Parts/Master Consistency
**Verifica**: Que la suma de notas en particellas sea igual al master
**Mensaje**: `Parts: 5000, Master: 5000`

### 9. All MIDI Files Generated
**Verifica**: Que se hayan generado todos los archivos MIDI
**Mensaje**: `8/8 files`

### Resultado de Validación

**Si todos los checks pasan**:
```
EXPORTACIÓN MIDI VALIDADA — OK
```

**Si algún check falla**:
```
Exportación completada con advertencias: 2 errores
```

---

## Principio de Identidad Musical

### Regla Fundamental

```
PARTICELLA_i = EXTRACCIÓN EXACTA DE PISTA_i DEL MASTER
```

Y:

```
SUMA LÓGICA DE TODAS LAS PARTICELLAS = SCORE MIDI COMPLETO
```

### Implicaciones

1. **No se pierden notas**: Toda nota del master aparece en su particella
2. **No se añaden notas**: Ninguna particella tiene notas que no estén en el master
3. **Posiciones absolutas**: Las particellas mantienen su posición temporal global
4. **Sincronización perfecta**: Al importar todas las particellas en un DAW, quedan sincronizadas

### Ejemplo de Sincronización

**Master MIDI**:
```
Compás 1: Violin toca en tick 0-480
Compás 1-4: Flauta en silencio (no toca)
Compás 5: Flauta toca en tick 7680-8160
```

**Particella Violin.mid**:
```
Compás 1: Notas en tick 0-480
Compás 2-4: Silencios (ticks 480-1920)
Compás 5: Silencio (ticks 7680-8160)
```

**Particella Flauta.mid**:
```
Compás 1-4: Silencios (ticks 0-7680) ← NO desplazado al inicio
Compás 5: Notas en tick 7680-8160
```

**Resultado**: Al importar ambas particellas en un DAW, quedan perfectamente sincronizadas.

---

## Integración con UI

### Nuevo Botón en ScoreView

**Ubicación**: Después de "Tests Score"

**Estilo**: Gradiente verde-azul con texto blanco

**Texto**: `Exportar MIDI Completo`

**Comportamiento**:
1. Si no hay extractionResult → ejecuta pipeline completo
2. Genera todos los archivos MIDI
3. Valida exportación
4. Descarga todos los archivos
5. Muestra resultado de validación

### Visualización del Resultado

Después de la exportación, se muestra un panel con:

**1. Archivos Generados**:
```
Master MIDI:          ProjectName_MASTER.mid
Score Conductor:      ProjectName_SCORE_CONDUCTOR_COMPLETO.mid
Particellas MIDI:     8 archivos generados
```

**2. Validación de Exportación**:
```
✓ PPQ Consistency: PPQ: 480
✓ Tempo Map Consistency: 3 tempo changes
✓ Time Signature Consistency: 2 time signatures
✓ Duration Consistency: Total ticks: 46080
✓ Track/Instrument Correspondence: All tracks matched
✓ No Duplicate Notes: No duplicates
✓ No Hanging Notes: All notes closed
✓ Parts/Master Consistency: Parts: 5000, Master: 5000
✓ All MIDI Files Generated: 8/8 files
```

**3. Manifest de Correspondencias**:
```
01_Violin.mid        Violin · Ch 1 · Prog 40
02_Viola.mid         Viola · Ch 2 · Prog 41
03_Cello.mid         Cello · Ch 3 · Prog 42
04_Contrabass.mid    Contrabass · Ch 4 · Prog 43
05_Bassoon.mid       Bassoon · Ch 5 · Prog 70
06_Clarinet.mid      Clarinet · Ch 6 · Prog 71
07_Oboe.mid          Oboe · Ch 7 · Prog 68
08_Drums.mid         Drums · Ch 10 · Prog 0
```

---

## Casos de Uso

### Caso 1: Exportación después de pipeline completo

**Flujo**:
1. Usuario carga MIDI
2. Usuario pulsa "Extraer Score y Parts"
3. Sistema ejecuta pipeline (ATAE, MMC, SAE, Score Model)
4. Usuario ve resultados (Full Score + particellas)
5. Usuario pulsa "Exportar MIDI Completo"
6. Sistema genera y descarga todos los archivos MIDI
7. Usuario ve validación exitosa

**Resultado**:
- 8 archivos MIDI descargados (1 master + 1 score + 6 particellas)
- 1 archivo JSON (manifest)
- Validación: 9/9 checks pasados

### Caso 2: Exportación directa sin pipeline previo

**Flujo**:
1. Usuario carga MIDI
2. Usuario va a "Score & Parts"
3. Usuario pulsa "Exportar MIDI Completo" directamente
4. Sistema detecta que no hay extractionResult
5. Sistema ejecuta pipeline completo automáticamente
6. Sistema genera y descarga todos los archivos MIDI
7. Usuario ve validación exitosa

**Resultado**: Mismo que Caso 1, pero con pipeline ejecutado automáticamente.

### Caso 3: Exportación con incidencias

**Flujo**:
1. Usuario carga MIDI con clusters sospechosos
2. Usuario pulsa "Exportar MIDI Completo"
3. Sistema ejecuta pipeline (SAE corrige incidencias)
4. Sistema genera archivos MIDI con correcciones aplicadas
5. Validación pasa (correcciones preservadas)
6. Usuario recibe archivos MIDI corregidos

**Resultado**:
- Archivos MIDI contienen correcciones de SAE
- Validación confirma identidad musical
- No se pierden correcciones en la exportación

---

## Principio de No Degradación

### Regla Fundamental

**LA EXPORTACIÓN NO PUEDE DESHACER LAS CORRECCIONES REALIZADAS ANTERIORMENTE.**

### Implicaciones

1. **Cuantización preservada**: Si SAE cuantizó notas, el MIDI exportado tiene notas cuantizadas
2. **Clusters resueltos**: Si SAE resolvió clusters, el MIDI exportado tiene clusters resueltos
3. **Micro-gaps corregidos**: Si SAE corrigió micro-gaps, el MIDI exportado tiene micro-gaps corregidos
4. **Duraciones corregidas**: Si SAE corrigió duraciones, el MIDI exportado tiene duraciones corregidas
5. **Asignaciones preservadas**: Si ATAE asignó instrumentos, el MIDI exportado tiene instrumentos asignados

### Flujo de Datos

```
MIDI Original
↓
ATAE (asignación de instrumentos)
↓
MMC (matriz maestra)
↓
SAE (autocorrección soberana)
↓
MMC Corregida ← Estado canónico
↓
Score Model
↓
Particellas
↓
Exportación MIDI ← Preserva todas las correcciones
```

---

## Validaciones Técnicas

### 1. Sincronización Temporal

**Prueba**: Importar todas las particellas en un DAW
**Resultado esperado**: Todas las partes quedan perfectamente sincronizadas
**Verificación**: Las notas de diferentes instrumentos que deben sonar simultáneamente suenan simultáneamente

### 2. Identidad Musical

**Prueba**: Comparar notas del master con suma de particellas
**Resultado esperado**: Mismo número de notas
**Verificación**: `totalNotesInParts === totalNotesInMaster`

### 3. Ausencia de Duplicados

**Prueba**: Buscar notas duplicadas en cada particella
**Resultado esperado**: 0 duplicados
**Verificación**: `duplicateNotes === 0`

### 4. Ausencia de Notas Colgadas

**Prueba**: Verificar que todas las notas tengan Note-Off
**Resultado esperado**: 0 notas colgadas
**Verificación**: `hangingNotes === 0`

### 5. Preservación de Silencios

**Prueba**: Verificar que los silencios reales se conserven
**Resultado esperado**: Compases de espera presentes en particellas
**Verificación**: Instrumentos que no tocan en ciertos compases tienen silencios en esas posiciones

---

## Limitaciones Conocidas

### 1. Descarga Individual de Archivos

Actualmente, todos los archivos se descargan individualmente (no en ZIP).

**Futuro**: Implementar descarga como archivo ZIP comprimido.

### 2. Nombres de Archivo

Los nombres de archivo se generan automáticamente basados en el nombre del instrumento.

**Limitación**: Si dos instrumentos tienen el mismo nombre, los archivos pueden colisionar.

**Solución actual**: Se añade índice numérico (`01_`, `02_`, etc.) para evitar colisiones.

### 3. Metadata MIDI

Los archivos MIDI generados contienen metadata básica (tempo, time signature, nombre de pista).

**Limitación**: No se incluyen markers, lyrics u otros eventos meta avanzados.

**Futuro**: Soporte para eventos meta adicionales.

---

## Próximos Pasos (Opcionales)

1. **Descarga ZIP**: Comprimir todos los archivos en un solo ZIP
2. **Metadata avanzada**: Incluir markers, lyrics, tempo changes textuales
3. **Preview MIDI**: Reproducir MIDI en el navegador antes de descargar
4. **Comparación A/B**: Comparar MIDI original vs MIDI exportado
5. **Exportación selectiva**: Permitir seleccionar qué particellas exportar
6. **Formatos adicionales**: Exportar en otros formatos (MusicXML ya implementado)

---

## Verificaciones

### Build
```
✓ vite build completado sin errores
✓ 1402 módulos transformados
✓ TypeScript type-check pasado
```

### Integración
```
✓ Módulo de exportación integrado con ScoreView
✓ Botón "Exportar MIDI Completo" funcional
✓ Pipeline se ejecuta automáticamente si es necesario
✓ Validación se muestra en UI
✓ Manifest se descarga correctamente
```

### Regresiones
```
✓ Pestaña MMC preservada
✓ Score & Parts preservado
✓ SAE preservado
✓ ATAE preservado
✓ Exportación MusicXML funcional
✓ Todas las funcionalidades existentes intactas
```

---

## Uso

### Desde la UI

1. Cargar MIDI
2. Ir a pestaña "Score & Parts"
3. Pulsar "Extraer Score y Parts" (si no se ha hecho)
4. Pulsar "Exportar MIDI Completo"
5. Ver progreso y validación
6. Recibir todos los archivos descargados

### Desde código

```typescript
import { exportCompleteMidi, downloadMidiPackage } from './export';

// Generar exportación
const result = exportCompleteMidi(project, mmc, extractionResult);

// Validar
if (result.validation.isValid) {
  console.log('Exportación válida');
}

// Descargar
downloadMidiPackage(result, project.name);

// Acceder a archivos individuales
const masterMidi = result.masterMidi;
const scoreMidi = result.conductorScoreMidi;
const partMidi = result.partMidiFiles.get('01_Violin.mid');
const manifest = result.manifest;
```

---

## Conclusión

La **exportación MIDI completa** ha sido implementada exitosamente como parte final obligatoria de todo proceso en MIDIEXTREMPLUS. El sistema:

✓ Genera Master MIDI Canónico
✓ Genera Score Conductor Completo
✓ Genera particellas MIDI individuales
✓ Genera Manifest de correspondencias
✓ Valida exportación con 9 checks
✓ Preserva todas las correcciones
✓ Mantiene sincronización temporal
✓ Garantiza identidad musical
✓ Se integra con pipeline existente
✓ Proporciona feedback visual claro

**Estado final**: ✅ IMPLEMENTADO

---

**Implementado por**: Asistente de desarrollo
**Fecha**: 2026
**Versión**: MIDI Export v1.0.0
**Proyecto**: sae-space-ai/midiextremplus
