// Store de estado del proyecto con persistencia en localStorage
import { MidiProject, QuantizeConfig, MidiNote } from '../midi/model';

const STORAGE_KEY = 'midi-projects';
const CURRENT_PROJECT_KEY = 'midi-current-project';

export function saveProject(project: MidiProject): void {
  try {
    const projects = loadAllProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.push(project);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    localStorage.setItem(CURRENT_PROJECT_KEY, project.id);
  } catch (e) {
    console.error('Error saving project:', e);
  }
}

export function loadProject(id: string): MidiProject | null {
  try {
    const projects = loadAllProjects();
    return projects.find(p => p.id === id) || null;
  } catch (e) {
    console.error('Error loading project:', e);
    return null;
  }
}

export function loadCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_PROJECT_KEY);
}

export function loadAllProjects(): MidiProject[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error('Error loading projects:', e);
    return [];
  }
}

export function deleteProject(id: string): void {
  try {
    const projects = loadAllProjects().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    if (loadCurrentProjectId() === id) {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
  } catch (e) {
    console.error('Error deleting project:', e);
  }
}

export function saveVersion(project: MidiProject, name: string): MidiProject {
  const version = {
    id: `v_${Date.now()}`,
    name,
    createdAt: Date.now(),
    notes: project.tracks.map(t => t.notes.map(n => ({ ...n }))),
    isApproved: false
  };
  
  const newProject = { ...project };
  newProject.versions = [...(newProject.versions || []), version];
  newProject.updatedAt = Date.now();
  
  saveProject(newProject);
  return newProject;
}

// Undo/Redo stack
interface HistoryEntry {
  project: MidiProject;
  timestamp: number;
  label: string;
}

const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
const MAX_HISTORY = 50;

export function pushHistory(project: MidiProject, label: string): void {
  undoStack.push({
    project: JSON.parse(JSON.stringify(project)),
    timestamp: Date.now(),
    label
  });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack.length = 0; // Clear redo on new action
}

export function undo(currentProject: MidiProject): MidiProject | null {
  if (undoStack.length === 0) return null;
  
  redoStack.push({
    project: JSON.parse(JSON.stringify(currentProject)),
    timestamp: Date.now(),
    label: 'Estado actual'
  });
  
  const entry = undoStack.pop()!;
  return entry.project;
}

export function redo(currentProject: MidiProject): MidiProject | null {
  if (redoStack.length === 0) return null;
  
  undoStack.push({
    project: JSON.parse(JSON.stringify(currentProject)),
    timestamp: Date.now(),
    label: 'Estado actual'
  });
  
  const entry = redoStack.pop()!;
  return entry.project;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}
