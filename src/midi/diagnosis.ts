// Centro de diagnóstico musical mejorado
// Identifica incidencias técnicas y musicales con acciones posibles

import { MidiProject, MidiNote, TrackInfo, DiagnosticIssue } from './model';

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueCategory = 
  | 'timing'       // Fuera de rejilla
  | 'overlap'      // Solapamientos
  | 'duplicate'    // Posibles duplicados
  | 'duration'     // Duraciones extremas
  | 'orphan'       // Notas sin cierre/inicio
  | 'simultaneity' // Simultaneidades sospechosas
  | 'subdivision'  // Mezcla de subdivisiones
  | 'program'      // Cambios de programa
  | 'trailing'     // Eventos posteriores al final
  | 'empty'        // Pistas vacías
  | 'temporal'     // Info temporal ausente/contradictoria
  | 'range';       // Notas fuera de registro

export interface EnhancedIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  message: string;
  evidence: string;
  explanation: string;
  actions: string[];
  trackIndex?: number;
  barNumber?: number;
  tick?: number;
  noteId?: string;
  pitch?: number;
}

let issueId = 5000;
function nextId(): string {
  return `diag_${++issueId}`;
}

/**
 * Análisis completo de diagnóstico musical
 */
export function runFullDiagnosis(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  // 1. Notas fuera de la rejilla
  issues.push(...detectOffGrid(project));
  
  // 2. Solapamientos
  issues.push(...detectOverlaps(project));
  
  // 3. Posibles duplicados
  issues.push(...detectDuplicates(project));
  
  // 4. Duraciones extremas
  issues.push(...detectExtremeDurations(project));
  
  // 5. Notas sin cierre
  issues.push(...detectUnclosedNotes(project));
  
  // 6. Simultaneidades sospechosas
  issues.push(...detectSuspiciousSimultaneities(project));
  
  // 7. Mezcla de subdivisiones
  issues.push(...detectMixedSubdivisions(project));
  
  // 8. Pistas vacías
  issues.push(...detectEmptyTracks(project));
  
  // 9. Info temporal ausente
  issues.push(...detectTemporalIssues(project));
  
  // 10. Notas fuera de registro
  issues.push(...detectOutOfRange(project));
  
  return issues;
}

/**
 * Detecta notas fuera de la rejilla elegida
 */
function detectOffGrid(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  const gridDivision = project.quantizeConfig.gridDivision;
  const tpb = project.ticksPerBeat;
  const gridTicks = (tpb * 4) / gridDivision;
  const tolerance = gridTicks / 8; // 1/8 de la rejilla
  
  for (const track of project.tracks) {
    for (const note of track.notes) {
      const posInBeat = note.startTick % tpb;
      const nearestGrid = Math.round(posInBeat / gridTicks) * gridTicks;
      const displacement = Math.abs(posInBeat - nearestGrid);
      
      if (displacement > tolerance) {
        const barInfo = getBarForTick(note.startTick, project);
        issues.push({
          id: nextId(),
          severity: 'warning',
          category: 'timing',
          title: 'Nota fuera de rejilla',
          message: `Pitch ${note.pitch} desviada ${displacement} ticks de la rejilla 1/${gridDivision}`,
          evidence: `Inicio: tick ${note.startTick}, posición en pulso: ${posInBeat}, rejilla más cercana: ${nearestGrid}`,
          explanation: `La nota no está alineada con la rejilla de ${gridDivision} divisiones por negra. Esto puede ser intencional (síncope, swing) o un error de timing.`,
          actions: [
            'Cuantizar al modo estricto',
            'Proteger si es intencional',
            'Revisar en contexto del compás'
          ],
          trackIndex: track.index,
          barNumber: barInfo.bar,
          tick: note.startTick,
          noteId: note.id,
          pitch: note.pitch
        });
      }
    }
  }
  
  return issues;
}

/**
 * Detecta solapamientos de notas en la misma pista y canal
 */
function detectOverlaps(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  for (const track of project.tracks) {
    const notesByChannel = new Map<number, MidiNote[]>();
    
    for (const note of track.notes) {
      const ch = note.channel;
      if (!notesByChannel.has(ch)) notesByChannel.set(ch, []);
      notesByChannel.get(ch)!.push(note);
    }
    
    for (const [channel, notes] of notesByChannel) {
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        
        if (current.endTick > next.startTick) {
          const overlapTicks = current.endTick - next.startTick;
          const isSamePitch = current.pitch === next.pitch;
          const barInfo = getBarForTick(current.startTick, project);
          
          issues.push({
            id: nextId(),
            severity: isSamePitch ? 'error' : 'warning',
            category: 'overlap',
            title: isSamePitch ? 'Solapamiento de misma altura' : 'Solapamiento polifónico',
            message: `Pitch ${current.pitch} y ${next.pitch} se solapan ${overlapTicks} ticks en canal ${channel + 1}`,
            evidence: `Nota 1: ${current.startTick}-${current.endTick}, Nota 2: ${next.startTick}-${next.endTick}`,
            explanation: isSamePitch
              ? 'Dos notas de la misma altura se solapan. Puede ser un error de transcripción o legato extremo con reataque.'
              : 'Notas de diferente altura se solapan. En partes monofónicas esto es un problema; en polifónicas puede ser legítimo.',
            actions: [
              'Recortar la primera nota',
              'Recortar la segunda nota',
              'Marcar como legítimo (polifonía)',
              'Revisar manualmente'
            ],
            trackIndex: track.index,
            barNumber: barInfo.bar,
            tick: current.startTick,
            noteId: current.id,
            pitch: current.pitch
          });
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta posibles notas duplicadas
 */
function detectDuplicates(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  const threshold = 10; // ticks
  
  for (const track of project.tracks) {
    const notesByChannel = new Map<number, MidiNote[]>();
    
    for (const note of track.notes) {
      const ch = note.channel;
      if (!notesByChannel.has(ch)) notesByChannel.set(ch, []);
      notesByChannel.get(ch)!.push(note);
    }
    
    for (const [_channel, notes] of notesByChannel) {
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        
        if (current.pitch === next.pitch &&
            Math.abs(current.startTick - next.startTick) < threshold &&
            Math.abs(current.endTick - next.endTick) < threshold) {
          const barInfo = getBarForTick(current.startTick, project);
          
          issues.push({
            id: nextId(),
            severity: 'warning',
            category: 'duplicate',
            title: 'Posible nota duplicada',
            message: `Dos notas de pitch ${current.pitch} muy cercanas en tiempo`,
            evidence: `Nota 1: inicio ${current.startTick}, Nota 2: inicio ${next.startTick} (diferencia: ${next.startTick - current.startTick} ticks)`,
            explanation: 'Dos notas idénticas muy cercanas pueden ser un error de transcripción o un reataque intencional.',
            actions: [
              'Eliminar la segunda nota',
              'Fusionar en una sola',
              'Conservar ambas si es reataque intencional'
            ],
            trackIndex: track.index,
            barNumber: barInfo.bar,
            tick: current.startTick,
            noteId: current.id,
            pitch: current.pitch
          });
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta duraciones extremadamente cortas o largas
 */
function detectExtremeDurations(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  const tpb = project.ticksPerBeat;
  const minDuration = tpb / 32; // Más corto que fusa
  const maxDuration = tpb * 16; // Más de 16 negras
  
  for (const track of project.tracks) {
    for (const note of track.notes) {
      const duration = note.endTick - note.startTick;
      const barInfo = getBarForTick(note.startTick, project);
      
      if (duration < minDuration && duration > 0) {
        issues.push({
          id: nextId(),
          severity: 'warning',
          category: 'duration',
          title: 'Duración extremadamente corta',
          message: `Nota de pitch ${note.pitch} con duración de ${duration} ticks (menos de fusa)`,
          evidence: `Inicio: ${note.startTick}, Fin: ${note.endTick}, Duración: ${duration} ticks`,
          explanation: 'Duraciones tan cortas pueden ser errores de transcripción o grace notes. Verificar si es intencional.',
          actions: [
            'Eliminar si es error',
            'Convertir en grace note',
            'Conservar si es intencional'
          ],
          trackIndex: track.index,
          barNumber: barInfo.bar,
          tick: note.startTick,
          noteId: note.id,
          pitch: note.pitch
        });
      }
      
      if (duration > maxDuration) {
        issues.push({
          id: nextId(),
          severity: 'info',
          category: 'duration',
          title: 'Duración muy larga',
          message: `Nota de pitch ${note.pitch} con duración de ${duration} ticks`,
          evidence: `Inicio: ${note.startTick}, Fin: ${note.endTick}, Duración: ${duration} ticks`,
          explanation: 'Nota muy larga. Puede ser un pedal sostenido o un error.',
          actions: [
            'Verificar si es intencional',
            'Acortar si es error'
          ],
          trackIndex: track.index,
          barNumber: barInfo.bar,
          tick: note.startTick,
          noteId: note.id,
          pitch: note.pitch
        });
      }
    }
  }
  
  return issues;
}

/**
 * Detecta notas sin cierre (ya detectadas en parser, pero las reformula)
 */
function detectUnclosedNotes(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  for (const track of project.tracks) {
    for (const note of track.notes) {
      if (note.isFlagged && note.flagReason?.includes('sin cierre')) {
        const barInfo = getBarForTick(note.startTick, project);
        issues.push({
          id: nextId(),
          severity: 'error',
          category: 'orphan',
          title: 'Nota sin cierre',
          message: `Nota de pitch ${note.pitch} sin Note Off correspondiente`,
          evidence: `Inicio: ${note.startTick}, truncada en tick ${note.endTick}`,
          explanation: 'La nota no tiene evento de cierre. Se ha truncado al final del archivo. Puede causar notas colgadas en la reproducción.',
          actions: [
            'Añadir cierre manual',
            'Eliminar la nota',
            'Conservar truncada'
          ],
          trackIndex: track.index,
          barNumber: barInfo.bar,
          tick: note.startTick,
          noteId: note.id,
          pitch: note.pitch
        });
      }
    }
  }
  
  return issues;
}

/**
 * Detecta simultaneidades sospechosas (clusters)
 */
function detectSuspiciousSimultaneities(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  const clusterThreshold = 20; // ticks - notas dentro de este rango se consideran cluster
  
  for (const track of project.tracks) {
    if (track.polyphony === 'mono') continue;
    
    const notesByChannel = new Map<number, MidiNote[]>();
    for (const note of track.notes) {
      const ch = note.channel;
      if (!notesByChannel.has(ch)) notesByChannel.set(ch, []);
      notesByChannel.get(ch)!.push(note);
    }
    
    for (const [_channel, notes] of notesByChannel) {
      const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
      
      for (let i = 0; i < sorted.length; i++) {
        const cluster: MidiNote[] = [sorted[i]];
        
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].startTick - sorted[i].startTick <= clusterThreshold) {
            cluster.push(sorted[j]);
          } else {
            break;
          }
        }
        
        if (cluster.length >= 3) {
          // Check if they could be sequential notes
          const totalDuration = cluster[cluster.length - 1].endTick - cluster[0].startTick;
          const avgDuration = totalDuration / cluster.length;
          const isSimultaneous = cluster.every(n => 
            Math.abs(n.startTick - cluster[0].startTick) < clusterThreshold / 2
          );
          
          if (!isSimultaneous && cluster.length >= 3) {
            const barInfo = getBarForTick(cluster[0].startTick, project);
            const pitches = cluster.map(n => n.pitch).join(', ');
            
            issues.push({
              id: nextId(),
              severity: 'warning',
              category: 'simultaneity',
              title: 'Cluster ambiguo',
              message: `${cluster.length} notas cercanas: ¿acorde o secuencia rápida?`,
              evidence: `Pitches: [${pitches}], rango temporal: ${cluster[0].startTick}-${cluster[cluster.length - 1].startTick} ticks`,
              explanation: 'Varias notas muy cercanas en tiempo. Podrían ser un acorde con ataques ligeramente desfasados o una sucesión rápida (arpegio/escala). El archivo no conserva información suficiente para determinarlo con certeza.',
              actions: [
                'Tratar como acorde (simultáneo)',
                'Tratar como secuencia (arpegio)',
                'Reordenar manualmente',
                'Escuchar y decidir'
              ],
              trackIndex: track.index,
              barNumber: barInfo.bar,
              tick: cluster[0].startTick,
              noteId: cluster[0].id,
              pitch: cluster[0].pitch
            });
          }
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta mezcla de subdivisiones en un mismo compás
 */
function detectMixedSubdivisions(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  const tpb = project.ticksPerBeat;
  
  for (const track of project.tracks) {
    const notesByBar = new Map<number, MidiNote[]>();
    
    for (const note of track.notes) {
      const barInfo = getBarForTick(note.startTick, project);
      const bar = barInfo.bar;
      if (!notesByBar.has(bar)) notesByBar.set(bar, []);
      notesByBar.get(bar)!.push(note);
    }
    
    for (const [bar, notes] of notesByBar) {
      if (notes.length < 3) continue;
      
      const durations = notes.map(n => n.endTick - n.startTick).filter(d => d > 0);
      const hasTriplets = durations.some(d => {
        const tripletEighth = (tpb * 2) / 3;
        return Math.abs(d - tripletEighth) < tpb / 8;
      });
      const hasStraight = durations.some(d => {
        return Math.abs(d - tpb / 2) < tpb / 8 || Math.abs(d - tpb / 4) < tpb / 16;
      });
      
      if (hasTriplets && hasStraight) {
        issues.push({
          id: nextId(),
          severity: 'info',
          category: 'subdivision',
          title: 'Mezcla de subdivisiones',
          message: `Compás ${bar}: mezcla de tresillos y subdivisiones binarias`,
          evidence: `Duraciones encontradas: [${durations.slice(0, 5).join(', ')}] ticks`,
          explanation: 'El compás contiene tanto subdivisiones ternarias como binarias. Esto es legítimo en mucha música, pero requiere que la rejilla de cuantización admita tresillos.',
          actions: [
            'Activar tresillos en la configuración',
            'Revisar si es intencional',
            'Cuantizar por separado cada subdivisión'
          ],
          trackIndex: track.index,
          barNumber: bar,
          tick: notes[0].startTick
        });
      }
    }
  }
  
  return issues;
}

/**
 * Detecta pistas vacías
 */
function detectEmptyTracks(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  for (const track of project.tracks) {
    if (track.noteCount === 0) {
      issues.push({
        id: nextId(),
        severity: 'warning',
        category: 'empty',
        title: 'Pista vacía',
        message: `La pista "${track.name}" no contiene notas`,
        evidence: `Pista ${track.index + 1}: 0 notas`,
        explanation: 'Pistas vacías pueden contener solo metadatos o controladores. No afectan la reproducción pero pueden ignorarse.',
        actions: [
          'Eliminar la pista',
          'Ignorar en el procesamiento',
          'Verificar si contiene datos útiles'
        ],
        trackIndex: track.index
      });
    }
  }
  
  return issues;
}

/**
 * Detecta problemas de información temporal
 */
function detectTemporalIssues(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  if (!project.missingInfo.hasTempo) {
    issues.push({
      id: nextId(),
      severity: 'warning',
      category: 'temporal',
      title: 'Tempo no indicado',
      message: `No se encontró indicación de tempo. Se asume ${project.missingInfo.assumedTempo} BPM.`,
      evidence: 'No hay evento de tempo (0xFF 0x51) al inicio del archivo',
      explanation: 'Sin tempo explícito, la duración en segundos es una estimación. La estructura rítmica en ticks es correcta.',
      actions: [
        'Establecer tempo manualmente',
        'Aceptar el valor asumido',
        'Verificar con la partitura original'
      ]
    });
  }
  
  if (!project.missingInfo.hasTimeSignature) {
    issues.push({
      id: nextId(),
      severity: 'warning',
      category: 'temporal',
      title: 'Compás no indicado',
      message: `No se encontró indicación de compás. Se asume ${project.missingInfo.assumedTimeSignature}.`,
      evidence: 'No hay evento de time signature (0xFF 0x58) al inicio del archivo',
      explanation: 'Sin compás explícito, la organización en compases es una estimación. Las posiciones de rejilla se calculan asumiendo el compás por defecto.',
      actions: [
        'Establecer compás manualmente',
        'Aceptar el valor asumido',
        'Verificar con la partitura original'
      ]
    });
  }
  
  return issues;
}

/**
 * Detecta notas fuera del registro de referencia
 */
function detectOutOfRange(project: MidiProject): EnhancedIssue[] {
  const issues: EnhancedIssue[] = [];
  
  // Registros de referencia por función
  const ranges: Record<string, { min: number; max: number; name: string }> = {
    'bass': { min: 28, max: 60, name: 'Bajo (E1-C4)' },
    'melody': { min: 48, max: 84, name: 'Melodía (C3-C6)' },
    'harmony': { min: 36, max: 84, name: 'Armonía (C2-C6)' },
    'percussion': { min: 35, max: 81, name: 'Percusión GM' }
  };
  
  for (const track of project.tracks) {
    const range = ranges[track.role];
    if (!range) continue;
    
    for (const note of track.notes) {
      if (note.pitch < range.min || note.pitch > range.max) {
        const barInfo = getBarForTick(note.startTick, project);
        issues.push({
          id: nextId(),
          severity: 'info',
          category: 'range',
          title: 'Nota fuera del registro habitual',
          message: `Pitch ${note.pitch} fuera del registro de ${range.name}`,
          evidence: `Pitch: ${note.pitch} (${getNoteName(note.pitch)}), Rango esperado: ${range.min}-${range.max}`,
          explanation: 'La nota está fuera del registro habitual para esta función musical. Puede ser legítimo (extensión del instrumento, transposición) o un error.',
          actions: [
            'Verificar si es intencional',
            'Transponer octava',
            'Reasignar a otra pista'
          ],
          trackIndex: track.index,
          barNumber: barInfo.bar,
          tick: note.startTick,
          noteId: note.id,
          pitch: note.pitch
        });
      }
    }
  }
  
  return issues;
}

// Utilidades
function getBarForTick(tick: number, project: MidiProject): { bar: number; position: number } {
  const tpb = project.ticksPerBeat;
  const num = project.timeSignatures[0]?.numerator || 4;
  const ticksPerBar = num * tpb;
  const bar = Math.floor(tick / ticksPerBar) + 1;
  const position = tick % ticksPerBar;
  return { bar, position };
}

function getNoteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

/**
 * Resume las incidencias por categoría
 */
export function summarizeIssues(issues: EnhancedIssue[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const issue of issues) {
    summary[issue.category] = (summary[issue.category] || 0) + 1;
  }
  return summary;
}

/**
 * Filtra incidencias por severidad
 */
export function filterBySeverity(issues: EnhancedIssue[], severity: IssueSeverity): EnhancedIssue[] {
  return issues.filter(i => i.severity === severity);
}

/**
 * Filtra incidencias por categoría
 */
export function filterByCategory(issues: EnhancedIssue[], category: IssueCategory): EnhancedIssue[] {
  return issues.filter(i => i.category === category);
}

/**
 * Filtra incidencias por pista
 */
export function filterByTrack(issues: EnhancedIssue[], trackIndex: number): EnhancedIssue[] {
  return issues.filter(i => i.trackIndex === trackIndex);
}
