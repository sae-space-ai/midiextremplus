// Editor musical - operaciones de edición sobre notas MIDI
// Transposición, división, unión, edición numérica, etc.

import { MidiProject, MidiNote, TrackInfo } from './model';

let noteIdCounter = 20000;
function nextId(): string {
  return `edit_note_${++noteIdCounter}`;
}

export interface EditResult {
  project: MidiProject;
  affectedNotes: number;
  description: string;
}

/**
 * Transpone notas seleccionadas por semitonos
 */
export function transposeNotes(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  semitones: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  let count = 0;
  for (const note of track.notes) {
    if (noteIds.has(note.id)) {
      note.pitch = Math.max(0, Math.min(127, note.pitch + semitones));
      note.correctedStartTick = note.correctedStartTick; // unchanged
      note.isModified = true;
      note.modificationReason = `Transposición: ${semitones > 0 ? '+' : ''}${semitones} semitonos`;
      count++;
    }
  }
  
  newProject.updatedAt = Date.now();
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} notas transpuestas ${semitones > 0 ? '+' : ''}${semitones} semitonos`
  };
}

/**
 * Transpone por octavas
 */
export function transposeOctave(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  octaves: number
): EditResult {
  return transposeNotes(project, trackIndex, noteIds, octaves * 12);
}

/**
 * Divide una nota en dos partes iguales
 */
export function divideNote(
  project: MidiProject,
  trackIndex: number,
  noteId: string,
  divisions: number = 2
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const noteIdx = track.notes.findIndex(n => n.id === noteId);
  if (noteIdx < 0) return { project: newProject, affectedNotes: 0, description: 'Nota no encontrada' };
  
  const note = track.notes[noteIdx];
  const totalDuration = note.endTick - note.startTick;
  const divisionDuration = Math.floor(totalDuration / divisions);
  
  if (divisionDuration < 1) {
    return { project: newProject, affectedNotes: 0, description: 'Duración insuficiente para dividir' };
  }
  
  // Remove original note
  track.notes.splice(noteIdx, 1);
  
  // Insert divided notes
  const newNotes: MidiNote[] = [];
  for (let i = 0; i < divisions; i++) {
    const start = note.startTick + i * divisionDuration;
    const end = i === divisions - 1 
      ? note.endTick // Last note gets remaining ticks
      : start + divisionDuration;
    
    newNotes.push({
      id: nextId(),
      trackIndex: track.index,
      channel: note.channel,
      pitch: note.pitch,
      velocity: note.velocity,
      startTick: start,
      endTick: end,
      correctedStartTick: start,
      correctedEndTick: end,
      originalStartTick: note.originalStartTick,
      originalEndTick: note.originalEndTick,
      isModified: true,
      isProtected: false,
      isFlagged: false,
      modificationReason: `Dividida de nota original en ${divisions} partes`,
      reviewStatus: 'pending'
    });
  }
  
  track.notes.splice(noteIdx, 0, ...newNotes);
  track.noteCount = track.notes.length;
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: 1,
    description: `Nota dividida en ${divisions} partes`
  };
}

/**
 * Une notas compatibles (misma altura, consecutivas)
 */
export function joinNotes(
  project: MidiProject,
  trackIndex: number,
  noteIds: string[]
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  if (noteIds.length < 2) {
    return { project: newProject, affectedNotes: 0, description: 'Se necesitan al menos 2 notas' };
  }
  
  const notes = noteIds
    .map(id => track.notes.find(n => n.id === id))
    .filter((n): n is MidiNote => n !== undefined)
    .sort((a, b) => a.startTick - b.startTick);
  
  if (notes.length < 2) {
    return { project: newProject, affectedNotes: 0, description: 'Notas no encontradas' };
  }
  
  // Check compatibility
  const pitch = notes[0].pitch;
  const allSamePitch = notes.every(n => n.pitch === pitch);
  
  if (!allSamePitch) {
    return { project: newProject, affectedNotes: 0, description: 'Las notas deben tener la misma altura para unirse' };
  }
  
  // Check consecutive (no gaps larger than threshold)
  const maxGap = 10; // ticks
  for (let i = 0; i < notes.length - 1; i++) {
    if (notes[i + 1].startTick - notes[i].endTick > maxGap) {
      return { project: newProject, affectedNotes: 0, description: 'Las notas no son consecutivas (hay un silencio grande entre ellas)' };
    }
  }
  
  // Join: create single note from first start to last end
  const firstNote = notes[0];
  const lastNote = notes[notes.length - 1];
  
  const joinedNote: MidiNote = {
    id: firstNote.id, // Keep first ID
    trackIndex: track.index,
    channel: firstNote.channel,
    pitch: firstNote.pitch,
    velocity: firstNote.velocity,
    startTick: firstNote.startTick,
    endTick: lastNote.endTick,
    correctedStartTick: firstNote.correctedStartTick,
    correctedEndTick: lastNote.correctedEndTick,
    originalStartTick: firstNote.originalStartTick,
    originalEndTick: lastNote.originalEndTick,
    isModified: true,
    isProtected: firstNote.isProtected,
    isFlagged: false,
    modificationReason: `Unión de ${notes.length} notas consecutivas`,
    reviewStatus: 'pending'
  };
  
  // Remove all notes except first, replace first with joined
  const idsToRemove = new Set(noteIds);
  track.notes = track.notes.filter(n => !idsToRemove.has(n.id));
  track.notes.push(joinedNote);
  track.notes.sort((a, b) => a.startTick - b.startTick);
  track.noteCount = track.notes.length;
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: notes.length,
    description: `${notes.length} notas unidas en una`
  };
}

/**
 * Edita numéricamente el inicio de una nota
 */
export function editNoteStart(
  project: MidiProject,
  trackIndex: number,
  noteId: string,
  newStartTick: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const note = track.notes.find(n => n.id === noteId);
  if (!note) return { project: newProject, affectedNotes: 0, description: 'Nota no encontrada' };
  
  if (newStartTick >= note.endTick) {
    return { project: newProject, affectedNotes: 0, description: 'El inicio no puede ser posterior al final' };
  }
  
  if (newStartTick < 0) {
    return { project: newProject, affectedNotes: 0, description: 'El inicio no puede ser negativo' };
  }
  
  note.startTick = newStartTick;
  note.correctedStartTick = newStartTick;
  note.isModified = true;
  note.modificationReason = `Inicio editado manualmente a tick ${newStartTick}`;
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: 1,
    description: `Inicio de nota editado a tick ${newStartTick}`
  };
}

/**
 * Edita numéricamente el final de una nota
 */
export function editNoteEnd(
  project: MidiProject,
  trackIndex: number,
  noteId: string,
  newEndTick: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const note = track.notes.find(n => n.id === noteId);
  if (!note) return { project: newProject, affectedNotes: 0, description: 'Nota no encontrada' };
  
  if (newEndTick <= note.startTick) {
    return { project: newProject, affectedNotes: 0, description: 'El final no puede ser anterior o igual al inicio' };
  }
  
  note.endTick = newEndTick;
  note.correctedEndTick = newEndTick;
  note.isModified = true;
  note.modificationReason = `Final editado manualmente a tick ${newEndTick}`;
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: 1,
    description: `Final de nota editado a tick ${newEndTick}`
  };
}

/**
 * Edita la velocidad de notas seleccionadas
 */
export function editVelocity(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  newVelocity: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const clampedVel = Math.max(1, Math.min(127, newVelocity));
  let count = 0;
  
  for (const note of track.notes) {
    if (noteIds.has(note.id)) {
      note.velocity = clampedVel;
      note.isModified = true;
      note.modificationReason = `Velocidad editada a ${clampedVel}`;
      count++;
    }
  }
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} notas con velocidad ajustada a ${clampedVel}`
  };
}

/**
 * Mueve notas seleccionadas por un offset en ticks
 */
export function moveNotes(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  tickOffset: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  let count = 0;
  
  for (const note of track.notes) {
    if (noteIds.has(note.id)) {
      const newStart = note.startTick + tickOffset;
      const newEnd = note.endTick + tickOffset;
      
      if (newStart < 0) {
        continue; // Skip if would go negative
      }
      
      note.startTick = newStart;
      note.endTick = newEnd;
      note.correctedStartTick = newStart;
      note.correctedEndTick = newEnd;
      note.isModified = true;
      note.modificationReason = `Desplazada ${tickOffset > 0 ? '+' : ''}${tickOffset} ticks`;
      count++;
    }
  }
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} notas desplazadas ${tickOffset > 0 ? '+' : ''}${tickOffset} ticks`
  };
}

/**
 * Duplica un fragmento de notas
 */
export function duplicateFragment(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  offsetTicks: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const sourceNotes = track.notes.filter(n => noteIds.has(n.id));
  if (sourceNotes.length === 0) {
    return { project: newProject, affectedNotes: 0, description: 'No hay notas seleccionadas' };
  }
  
  const newNotes: MidiNote[] = sourceNotes.map(note => ({
    id: nextId(),
    trackIndex: track.index,
    channel: note.channel,
    pitch: note.pitch,
    velocity: note.velocity,
    startTick: note.startTick + offsetTicks,
    endTick: note.endTick + offsetTicks,
    correctedStartTick: note.correctedStartTick + offsetTicks,
    correctedEndTick: note.correctedEndTick + offsetTicks,
    originalStartTick: note.startTick + offsetTicks,
    originalEndTick: note.endTick + offsetTicks,
    isModified: true,
    isProtected: false,
    isFlagged: false,
    modificationReason: `Duplicada con desplazamiento de ${offsetTicks} ticks`,
    reviewStatus: 'pending'
  }));
  
  track.notes.push(...newNotes);
  track.notes.sort((a, b) => a.startTick - b.startTick);
  track.noteCount = track.notes.length;
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: newNotes.length,
    description: `${newNotes.length} notas duplicadas con desplazamiento de ${offsetTicks} ticks`
  };
}

/**
 * Protege o desprotege notas
 */
export function toggleProtection(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  protect: boolean
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  let count = 0;
  for (const note of track.notes) {
    if (noteIds.has(note.id)) {
      note.isProtected = protect;
      count++;
    }
  }
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} notas ${protect ? 'protegidas' : 'desprotegidas'}`
  };
}

/**
 * Selecciona notas por rango de compases
 */
export function selectByBarRange(
  project: MidiProject,
  trackIndex: number,
  startBar: number,
  endBar: number
): Set<string> {
  const track = project.tracks[trackIndex];
  if (!track) return new Set();
  
  const tpb = project.ticksPerBeat;
  const num = project.timeSignatures[0]?.numerator || 4;
  const ticksPerBar = num * tpb;
  
  const startTick = (startBar - 1) * ticksPerBar;
  const endTick = endBar * ticksPerBar;
  
  const selected = new Set<string>();
  for (const note of track.notes) {
    if (note.startTick >= startTick && note.startTick < endTick) {
      selected.add(note.id);
    }
  }
  
  return selected;
}

/**
 * Selecciona notas por rango de alturas
 */
export function selectByPitchRange(
  project: MidiProject,
  trackIndex: number,
  minPitch: number,
  maxPitch: number
): Set<string> {
  const track = project.tracks[trackIndex];
  if (!track) return new Set();
  
  const selected = new Set<string>();
  for (const note of track.notes) {
    if (note.pitch >= minPitch && note.pitch <= maxPitch) {
      selected.add(note.id);
    }
  }
  
  return selected;
}

/**
 * Elimina notas seleccionadas
 */
export function deleteNotes(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const count = track.notes.filter(n => noteIds.has(n.id)).length;
  track.notes = track.notes.filter(n => !noteIds.has(n.id));
  track.noteCount = track.notes.length;
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} notas eliminadas`
  };
}

/**
 * Normaliza velocidades (escala al rango dado)
 */
export function normalizeVelocity(
  project: MidiProject,
  trackIndex: number,
  noteIds: Set<string>,
  minVel: number,
  maxVel: number
): EditResult {
  const newProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const track = newProject.tracks[trackIndex];
  if (!track) return { project: newProject, affectedNotes: 0, description: 'Pista no encontrada' };
  
  const selectedNotes = track.notes.filter(n => noteIds.has(n.id));
  if (selectedNotes.length === 0) {
    return { project: newProject, affectedNotes: 0, description: 'No hay notas seleccionadas' };
  }
  
  const currentMin = Math.min(...selectedNotes.map(n => n.velocity));
  const currentMax = Math.max(...selectedNotes.map(n => n.velocity));
  const currentRange = currentMax - currentMin || 1;
  const targetRange = maxVel - minVel;
  
  let count = 0;
  for (const note of selectedNotes) {
    const normalized = (note.velocity - currentMin) / currentRange;
    note.velocity = Math.round(minVel + normalized * targetRange);
    note.velocity = Math.max(1, Math.min(127, note.velocity));
    note.isModified = true;
    note.modificationReason = `Velocidad normalizada a rango ${minVel}-${maxVel}`;
    count++;
  }
  
  newProject.updatedAt = Date.now();
  
  return {
    project: newProject,
    affectedNotes: count,
    description: `${count} velocidades normalizadas al rango ${minVel}-${maxVel}`
  };
}
