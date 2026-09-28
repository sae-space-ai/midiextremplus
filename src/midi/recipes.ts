// Recetas de procesamiento - cadenas de operaciones guardables

import { MidiProject, QuantizeConfig } from './model';
import { quantizeProject, QuantizeStats } from './quantize';

export type OperationType = 
  | 'quantize_attacks'
  | 'quantize_durations'
  | 'diagnose_overlaps'
  | 'review_duplicates'
  | 'edit_velocity'
  | 'transpose'
  | 'reassign_instruments'
  | 'validate'
  | 'export';

export interface RecipeStep {
  id: string;
  operation: OperationType;
  label: string;
  params: Record<string, any>;
  version: string;
  requiresReview: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: RecipeStep[];
  createdAt: number;
  isBuiltIn: boolean;
}

export interface RecipeResult {
  project: MidiProject;
  stepResults: { step: RecipeStep; result: string; stats?: QuantizeStats }[];
  warnings: string[];
}

// Recetas integradas
export const BUILT_IN_RECIPES: Recipe[] = [
  {
    id: 'basic_quantize',
    name: 'Cuantización básica',
    description: 'Analiza, cuantiza ataques y valida el resultado.',
    version: '1.0',
    steps: [
      { id: 's1', operation: 'quantize_attacks', label: 'Cuantizar ataques', params: { mode: 'strict', gridDivision: 16, strength: 100 }, version: '1.0', requiresReview: false },
      { id: 's2', operation: 'validate', label: 'Validar resultado', params: {}, version: '1.0', requiresReview: false }
    ],
    createdAt: Date.now(),
    isBuiltIn: true
  },
  {
    id: 'full_review',
    name: 'Revisión completa',
    description: 'Diagnóstico, cuantización interpretativa y revisión de solapamientos.',
    version: '1.0',
    steps: [
      { id: 's1', operation: 'diagnose_overlaps', label: 'Diagnosticar solapamientos', params: {}, version: '1.0', requiresReview: true },
      { id: 's2', operation: 'quantize_attacks', label: 'Cuantizar ataques', params: { mode: 'interpretive', gridDivision: 8, strength: 70 }, version: '1.0', requiresReview: false },
      { id: 's3', operation: 'review_duplicates', label: 'Revisar duplicados', params: {}, version: '1.0', requiresReview: true },
      { id: 's4', operation: 'validate', label: 'Validar resultado', params: {}, version: '1.0', requiresReview: false }
    ],
    createdAt: Date.now(),
    isBuiltIn: true
  },
  {
    id: 'notation_prep',
    name: 'Preparación para notación',
    description: 'Cuantización estricta con normalización de duraciones para partitura limpia.',
    version: '1.0',
    steps: [
      { id: 's1', operation: 'quantize_attacks', label: 'Cuantizar ataques (estricto)', params: { mode: 'strict', gridDivision: 16, strength: 100 }, version: '1.0', requiresReview: false },
      { id: 's2', operation: 'quantize_durations', label: 'Normalizar duraciones', params: {}, version: '1.0', requiresReview: true },
      { id: 's3', operation: 'validate', label: 'Validar resultado', params: {}, version: '1.0', requiresReview: false }
    ],
    createdAt: Date.now(),
    isBuiltIn: true
  },
  {
    id: 'expressive_preserve',
    name: 'Conservar expresividad',
    description: 'Cuantización mínima para preservar la interpretación humana.',
    version: '1.0',
    steps: [
      { id: 's1', operation: 'quantize_attacks', label: 'Cuantizar suavemente', params: { mode: 'interpretive', gridDivision: 16, strength: 40 }, version: '1.0', requiresReview: false },
      { id: 's2', operation: 'validate', label: 'Validar', params: {}, version: '1.0', requiresReview: false }
    ],
    createdAt: Date.now(),
    isBuiltIn: true
  }
];

const CUSTOM_RECIPES_KEY = 'midi-custom-recipes';

export function loadCustomRecipes(): Recipe[] {
  try {
    const data = localStorage.getItem(CUSTOM_RECIPES_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveCustomRecipe(recipe: Recipe): void {
  const recipes = loadCustomRecipes();
  const idx = recipes.findIndex(r => r.id === recipe.id);
  if (idx >= 0) {
    recipes[idx] = recipe;
  } else {
    recipes.push(recipe);
  }
  localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(recipes));
}

export function deleteCustomRecipe(id: string): void {
  const recipes = loadCustomRecipes().filter(r => r.id !== id);
  localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(recipes));
}

export function getAllRecipes(): Recipe[] {
  return [...BUILT_IN_RECIPES, ...loadCustomRecipes()];
}

export function createCustomRecipe(name: string, description: string, steps: RecipeStep[]): Recipe {
  return {
    id: `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    description,
    version: '1.0',
    steps,
    createdAt: Date.now(),
    isBuiltIn: false
  };
}

/**
 * Ejecuta una receta sobre un proyecto
 */
export function executeRecipe(project: MidiProject, recipe: Recipe): RecipeResult {
  let currentProject = JSON.parse(JSON.stringify(project)) as MidiProject;
  const stepResults: { step: RecipeStep; result: string; stats?: QuantizeStats }[] = [];
  const warnings: string[] = [];
  
  for (const step of recipe.steps) {
    try {
      switch (step.operation) {
        case 'quantize_attacks': {
          const config: QuantizeConfig = {
            ...currentProject.quantizeConfig,
            mode: step.params.mode || 'strict',
            gridDivision: step.params.gridDivision || 16,
            strength: step.params.strength || 100,
            useTriplets: step.params.useTriplets || false,
            maxDisplacement: step.params.maxDisplacement || currentProject.ticksPerBeat,
            quantizeAttacksOnly: true
          };
          const result = quantizeProject(currentProject, config);
          currentProject = result.project;
          stepResults.push({
            step,
            result: `Cuantización ${config.mode}: ${result.stats.quantizedNotes} notas ajustadas`,
            stats: result.stats
          });
          break;
        }
        case 'quantize_durations': {
          // Normalize durations to nearest grid
          const gridDiv = step.params.gridDivision || 16;
          const tpb = currentProject.ticksPerBeat;
          const gridTicks = (tpb * 4) / gridDiv;
          let count = 0;
          
          for (const track of currentProject.tracks) {
            for (const note of track.notes) {
              const duration = note.endTick - note.startTick;
              const nearestGrid = Math.round(duration / gridTicks) * gridTicks;
              if (nearestGrid > 0 && Math.abs(duration - nearestGrid) < gridTicks / 2) {
                note.endTick = note.startTick + nearestGrid;
                note.correctedEndTick = note.endTick;
                note.isModified = true;
                count++;
              }
            }
          }
          
          stepResults.push({ step, result: `${count} duraciones normalizadas a rejilla 1/${gridDiv}` });
          break;
        }
        case 'diagnose_overlaps': {
          let overlapCount = 0;
          for (const track of currentProject.tracks) {
            const sorted = [...track.notes].sort((a, b) => a.startTick - b.startTick);
            for (let i = 0; i < sorted.length - 1; i++) {
              if (sorted[i].endTick > sorted[i + 1].startTick) {
                overlapCount++;
              }
            }
          }
          stepResults.push({ step, result: `${overlapCount} solapamientos detectados` });
          if (overlapCount > 0) {
            warnings.push(`${overlapCount} solapamientos requieren revisión`);
          }
          break;
        }
        case 'review_duplicates': {
          let dupCount = 0;
          for (const track of currentProject.tracks) {
            const sorted = [...track.notes].sort((a, b) => a.startTick - b.startTick);
            for (let i = 0; i < sorted.length - 1; i++) {
              if (sorted[i].pitch === sorted[i + 1].pitch && 
                  Math.abs(sorted[i].startTick - sorted[i + 1].startTick) < 10) {
                dupCount++;
              }
            }
          }
          stepResults.push({ step, result: `${dupCount} posibles duplicados señalados` });
          if (dupCount > 0) {
            warnings.push(`${dupCount} posibles duplicados requieren revisión manual`);
          }
          break;
        }
        case 'validate': {
          // Basic validation
          let validNotes = 0;
          let invalidNotes = 0;
          for (const track of currentProject.tracks) {
            for (const note of track.notes) {
              if (note.endTick > note.startTick && note.pitch >= 0 && note.pitch <= 127) {
                validNotes++;
              } else {
                invalidNotes++;
              }
            }
          }
          stepResults.push({ step, result: `Validación: ${validNotes} notas válidas, ${invalidNotes} inválidas` });
          if (invalidNotes > 0) {
            warnings.push(`${invalidNotes} notas con datos inválidos`);
          }
          break;
        }
        default:
          stepResults.push({ step, result: `Operación "${step.operation}" no implementada en este contexto` });
          warnings.push(`Paso "${step.label}" omitido`);
      }
    } catch (e) {
      stepResults.push({ step, result: `Error: ${(e as Error).message}` });
      warnings.push(`Error en paso "${step.label}": ${(e as Error).message}`);
    }
  }
  
  currentProject.updatedAt = Date.now();
  
  return {
    project: currentProject,
    stepResults,
    warnings
  };
}

/**
 * Vista previa de una receta sin aplicar
 */
export function previewRecipe(project: MidiProject, recipe: Recipe): { steps: string[]; warnings: string[] } {
  const steps: string[] = [];
  const warnings: string[] = [];
  
  for (const step of recipe.steps) {
    let desc = `${step.label}`;
    
    switch (step.operation) {
      case 'quantize_attacks':
        desc += ` (modo ${step.params.mode || 'strict'}, rejilla 1/${step.params.gridDivision || 16}, fuerza ${step.params.strength || 100}%)`;
        break;
      case 'quantize_durations':
        desc += ` (rejilla 1/${step.params.gridDivision || 16})`;
        break;
      case 'diagnose_overlaps':
        desc += ' (detección de solapamientos)';
        break;
      case 'review_duplicates':
        desc += ' (detección de duplicados)';
        break;
      case 'validate':
        desc += ' (verificación de integridad)';
        break;
    }
    
    if (step.requiresReview) {
      desc += ' ⚠ Requiere revisión';
      warnings.push(`"${step.label}" requiere revisión antes de continuar`);
    }
    
    steps.push(desc);
  }
  
  return { steps, warnings };
}
