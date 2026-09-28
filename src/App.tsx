import { useState, useEffect, useRef, useCallback } from 'react';
import { parseMidiFile } from './midi/parser';
import { quantizeProject } from './midi/quantize';
import { writeMidiFile, verifyMidiExport, generateReport, generateJsonReport } from './midi/writer';
import { MidiProject, QuantizeConfig } from './midi/model';
import { audioEngine } from './audio/engine';
import { metronome } from './audio/metronome';
import { saveProject, loadProject, loadAllProjects, deleteProject, pushHistory, undo, redo, canUndo, canRedo, clearHistory, saveVersion } from './store/project';
import { EXAMPLES, getExamplesByCategory } from './midi/examples';
import { getAllProfiles, applyProfileToProject, BUILT_IN_PROFILES } from './midi/profiles';
import { runFullDiagnosis, EnhancedIssue, summarizeIssues } from './midi/diagnosis';
import { transposeNotes, transposeOctave, divideNote, joinNotes, editVelocity, editNoteStart, editNoteEnd, moveNotes, duplicateFragment, toggleProtection, deleteNotes, normalizeVelocity } from './midi/editor';
import { analyzePitchDistribution, analyzeRhythm, estimateKey, fullTrackAnalysis, getNoteName as analysisGetNoteName } from './midi/analysis';
import { INSTRUMENT_CATALOG, getInstrumentByProgram, getInstrumentName, getAllFamilies } from './midi/instruments';
import { getAllRecipes, executeRecipe, previewRecipe, Recipe } from './midi/recipes';
import { processWithMMC, runAllTests, MMCProject as MMCProjectType, generateExportSummary, verifyBeforeExport } from './mmc';
import { extractScoreAndParts, exportFullScoreToMusicXML, exportPartToMusicXMLString, downloadMusicXML, runAllScoreTests, Score as ScoreType, IndividualPart as IndividualPartType, ExtractionResult as ExtractionResultType } from './score';
import { Upload, Play, Pause, Square, Download, Undo2, Redo2, Settings, Music, AlertTriangle, CheckCircle, Info, X, ChevronRight, Layers, Grid3X3, Volume2, Save, FolderOpen, Trash2, FileAudio, ZoomIn, ZoomOut, SkipBack, SkipForward, BookOpen, Activity, Mic2, Wand2, ListChecks, BarChart3, Piano, HelpCircle, Copy, ArrowUpDown, Scissors, Link2, Move, Shield, Type, Database, TestTube, FileMusic, Users } from 'lucide-react';

type View = 'welcome' | 'project' | 'projects-list' | 'examples' | 'help';
type Tab = 'diagnosis' | 'piano-roll' | 'bars' | 'quantize' | 'editor' | 'analysis' | 'instruments' | 'recipes' | 'mmc' | 'score' | 'export';

function App() {
  const [view, setView] = useState<View>('welcome');
  const [project, setProject] = useState<MidiProject | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('diagnosis');
  const [selectedTrack, setSelectedTrack] = useState<number>(0);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTick, setCurrentTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [showQuantizeConfig, setShowQuantizeConfig] = useState(false);
  const [quantizeResult, setQuantizeResult] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'corrected' | 'original'>('corrected');
  const [volume, setVolume] = useState(0.5);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [diagnosisIssues, setDiagnosisIssues] = useState<EnhancedIssue[]>([]);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [trackMutes, setTrackMutes] = useState<Set<number>>(new Set());
  const [trackSolos, setTrackSolos] = useState<Set<number>>(new Set());
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [mmcProject, setMmcProject] = useState<MMCProjectType | null>(null);
  const [mmcProcessing, setMmcProcessing] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResultType | null>(null);
  const [scoreProcessing, setScoreProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pianoRollRef = useRef<HTMLCanvasElement>(null);

  // Show notification
  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // Load project from storage
  useEffect(() => {
    const projects = loadAllProjects();
    if (projects.length > 0) {
      // Don't auto-load, let user choose
    }
  }, []);

  // Audio engine setup
  useEffect(() => {
    audioEngine.setOnPositionChange((tick, _seconds) => {
      setCurrentTick(tick);
    });
    return () => {
      audioEngine.destroy();
    };
  }, []);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      notify('El archivo debe tener extensión .mid o .midi', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      notify('El archivo es demasiado grande (máximo 50 MB)', 'error');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiFile(buffer);
      parsed.name = file.name.replace(/\.(mid|midi)$/i, '');
      saveProject(parsed);
      setProject(parsed);
      setView('project');
      setActiveTab('diagnosis');
      clearHistory();
      notify(`Archivo cargado: ${parsed.tracks.length} pistas, ${parsed.tracks.reduce((s, t) => s + t.noteCount, 0)} notas`, 'success');
    } catch (err) {
      notify(`Error al leer el archivo: ${(err as Error).message}`, 'error');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Quantize
  const handleQuantize = () => {
    if (!project) return;
    
    pushHistory(project, 'Antes de cuantizar');
    
    const result = quantizeProject(project, project.quantizeConfig);
    setProject(result.project);
    saveProject(result.project);
    
    const msg = `Cuantización ${result.project.quantizeConfig.mode === 'strict' ? 'estricta' : result.project.quantizeConfig.mode === 'interpretive' ? 'interpretativa' : 'asistida'}: ${result.stats.quantizedNotes} notas ajustadas, ${result.stats.flaggedNotes} señaladas, ${result.stats.notesBeyondLimit} fuera de límite.`;
    setQuantizeResult(msg);
    notify(msg, 'success');
  };

  // Undo quantize
  const handleUndoQuantize = () => {
    if (!project) return;
    const restored = undo(project);
    if (restored) {
      setProject(restored);
      saveProject(restored);
      notify('Cuantización deshecha', 'info');
    }
  };

  // Undo/Redo general
  const handleUndo = () => {
    if (!project) return;
    const prev = undo(project);
    if (prev) {
      setProject(prev);
      saveProject(prev);
      notify('Deshacer', 'info');
    }
  };

  const handleRedo = () => {
    if (!project) return;
    const next = redo(project);
    if (next) {
      setProject(next);
      saveProject(next);
      notify('Rehacer', 'info');
    }
  };

  // Play/Stop
  const handlePlay = async () => {
    if (!project) return;
    if (isPlaying) {
      audioEngine.stop();
      metronome.stop();
      setIsPlaying(false);
    } else {
      audioEngine.setProject(project);
      audioEngine.setUseCorrected(comparisonMode === 'corrected');
      audioEngine.setVolume(volume);
      await audioEngine.play(currentTick);
      if (metronomeOn) {
        metronome.setBPM(metronomeBpm);
        if (project.timeSignatures[0]) {
          metronome.setTimeSignature(project.timeSignatures[0].numerator, project.timeSignatures[0].denominator);
        }
        metronome.start();
      }
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    metronome.stop();
    setIsPlaying(false);
    setCurrentTick(0);
  };

  // Export
  const handleExport = () => {
    if (!project) return;
    
    const midiData = writeMidiFile(project, true);
    const originalNoteCount = project.tracks.reduce((s, t) => s + t.noteCount, 0);
    const verification = verifyMidiExport(midiData, originalNoteCount);
    
    if (!verification.valid) {
      notify(`Advertencia en exportación: ${verification.errors.join(', ')}`, 'error');
    }
    
    // Download MIDI
    const arrayBuffer = new Uint8Array(midiData).buffer as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}_procesado.mid`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Download report
    const report = generateReport(project);
    const reportBlob = new Blob([report], { type: 'text/plain' });
    const reportUrl = URL.createObjectURL(reportBlob);
    const reportA = document.createElement('a');
    reportA.href = reportUrl;
    reportA.download = `${project.name}_informe.txt`;
    reportA.click();
    URL.revokeObjectURL(reportUrl);
    
    // Download JSON report
    const jsonReport = generateJsonReport(project);
    const jsonBlob = new Blob([JSON.stringify(jsonReport, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonA = document.createElement('a');
    jsonA.href = jsonUrl;
    jsonA.download = `${project.name}_informe.json`;
    jsonA.click();
    URL.revokeObjectURL(jsonUrl);
    
    notify('Archivos exportados: MIDI, informe TXT e informe JSON', 'success');
  };

  // Save version
  const handleSaveVersion = () => {
    if (!project) return;
    const name = `Versión ${project.versions.length + 1} - ${new Date().toLocaleTimeString('es-ES')}`;
    const updated = saveVersion(project, name);
    setProject(updated);
    notify(`Versión guardada: ${name}`, 'success');
  };

  // Update quantize config
  const updateConfig = (updates: Partial<QuantizeConfig>) => {
    if (!project) return;
    const newConfig = { ...project.quantizeConfig, ...updates };
    const newProject = { ...project, quantizeConfig: newConfig };
    setProject(newProject);
  };

  // Toggle track mute/solo
  const toggleTrackRole = (trackIdx: number, role: string) => {
    if (!project) return;
    const newProject = { ...project };
    newProject.tracks = [...newProject.tracks];
    newProject.tracks[trackIdx] = { ...newProject.tracks[trackIdx], role: role as any };
    setProject(newProject);
    saveProject(newProject);
  };

  // Piano Roll rendering
  useEffect(() => {
    if (!project || !pianoRollRef.current || activeTab !== 'piano-roll') return;
    
    const canvas = pianoRollRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    const track = project.tracks[selectedTrack];
    if (!track) return;
    
    const notes = track.notes;
    if (notes.length === 0) return;
    
    // Calculate ranges
    const minPitch = Math.min(...notes.map(n => n.pitch)) - 2;
    const maxPitch = Math.max(...notes.map(n => n.pitch)) + 2;
    const pitchRange = maxPitch - minPitch;
    
    const startTick = scrollX;
    const endTick = startTick + (project.totalTicks / zoom);
    const tickRange = endTick - startTick;
    
    const noteHeight = Math.max(2, height / pitchRange);
    const pxPerTick = width / tickRange;
    
    // Draw grid
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 0.5;
    
    // Horizontal grid (pitches)
    for (let p = minPitch; p <= maxPitch; p++) {
      const y = height - ((p - minPitch) / pitchRange) * height;
      const isC = p % 12 === 0;
      ctx.strokeStyle = isC ? '#4a4a6a' : '#2a2a4a';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      if (isC) {
        ctx.fillStyle = '#8888aa';
        ctx.font = '10px monospace';
        ctx.fillText(`C${Math.floor(p / 12) - 1}`, 2, y - 2);
      }
    }
    
    // Vertical grid (beats)
    const ticksPerBeat = project.ticksPerBeat;
    const beatStart = Math.floor(startTick / ticksPerBeat);
    const beatEnd = Math.ceil(endTick / ticksPerBeat);
    
    for (let beat = beatStart; beat <= beatEnd; beat++) {
      const x = (beat * ticksPerBeat - startTick) * pxPerTick;
      const isBar = beat % (project.timeSignatures[0]?.numerator || 4) === 0;
      ctx.strokeStyle = isBar ? '#5a5a7a' : '#2a2a4a';
      ctx.lineWidth = isBar ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      if (isBar) {
        ctx.fillStyle = '#aaaacc';
        ctx.font = '11px monospace';
        const barNum = Math.floor(beat / (project.timeSignatures[0]?.numerator || 4)) + 1;
        ctx.fillText(`${barNum}`, x + 3, 12);
      }
    }
    
    // Draw notes
    const useCorrected = comparisonMode === 'corrected';
    
    for (const note of notes) {
      const noteStartTick = useCorrected ? note.correctedStartTick : note.startTick;
      const noteEndTick = useCorrected ? note.correctedEndTick : note.endTick;
      
      if (noteEndTick < startTick || noteStartTick > endTick) continue;
      
      const x = (noteStartTick - startTick) * pxPerTick;
      const w = Math.max(2, (noteEndTick - noteStartTick) * pxPerTick);
      const y = height - ((note.pitch - minPitch + 1) / pitchRange) * height;
      const h = noteHeight - 1;
      
      // Color based on state
      if (note.isFlagged) {
        ctx.fillStyle = '#ff6b6b';
      } else if (note.isModified) {
        ctx.fillStyle = '#4ecdc4';
      } else if (selectedNotes.has(note.id)) {
        ctx.fillStyle = '#ffe66d';
      } else {
        ctx.fillStyle = '#7c83ff';
      }
      
      ctx.fillRect(x, y, w, h);
      
      // Border for selected
      if (selectedNotes.has(note.id)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }
    
    // Draw playhead
    if (currentTick >= startTick && currentTick <= endTick) {
      const playheadX = (currentTick - startTick) * pxPerTick;
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
    
  }, [project, selectedTrack, zoom, scrollX, comparisonMode, currentTick, selectedNotes, activeTab]);

  // Piano roll click handler
  const handlePianoRollClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!project || !pianoRollRef.current) return;
    
    const canvas = pianoRollRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const track = project.tracks[selectedTrack];
    if (!track) return;
    
    const notes = track.notes;
    if (notes.length === 0) return;
    
    const minPitch = Math.min(...notes.map(n => n.pitch)) - 2;
    const maxPitch = Math.max(...notes.map(n => n.pitch)) + 2;
    const pitchRange = maxPitch - minPitch;
    
    const startTick = scrollX;
    const tickRange = project.totalTicks / zoom;
    const pxPerTick = canvas.width / tickRange;
    
    const clickedTick = startTick + (clickX / canvas.width) * tickRange;
    const clickedPitch = maxPitch - (clickY / canvas.height) * pitchRange;
    
    // Find clicked note
    const useCorrected = comparisonMode === 'corrected';
    for (const note of notes) {
      const noteStartTick = useCorrected ? note.correctedStartTick : note.startTick;
      const noteEndTick = useCorrected ? note.correctedEndTick : note.endTick;
      
      if (clickedTick >= noteStartTick && clickedTick <= noteEndTick &&
          Math.abs(clickedPitch - note.pitch) < 1) {
        const newSelected = new Set(selectedNotes);
        if (e.shiftKey) {
          if (newSelected.has(note.id)) {
            newSelected.delete(note.id);
          } else {
            newSelected.add(note.id);
          }
        } else {
          newSelected.clear();
          newSelected.add(note.id);
        }
        setSelectedNotes(newSelected);
        return;
      }
    }
    
    // Click on empty space - seek
    setCurrentTick(Math.round(clickedTick));
    setSelectedNotes(new Set());
  };

  // Projects list
  const [projectsList, setProjectsList] = useState<MidiProject[]>([]);
  
  const refreshProjectsList = () => {
    setProjectsList(loadAllProjects());
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    refreshProjectsList();
    notify('Proyecto eliminado', 'info');
  };

  const handleOpenProject = (id: string) => {
    const p = loadProject(id);
    if (p) {
      setProject(p);
      setView('project');
      clearHistory();
    }
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
          notification.type === 'success' ? 'bg-green-800 border border-green-600' :
          notification.type === 'error' ? 'bg-red-800 border border-red-600' :
          'bg-blue-800 border border-blue-600'
        }`}>
          {notification.type === 'success' && <CheckCircle size={16} />}
          {notification.type === 'error' && <AlertTriangle size={16} />}
          {notification.type === 'info' && <Info size={16} />}
          <span className="text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Music className="text-indigo-400" size={24} />
          <h1 className="text-lg font-bold text-white">MIDI Cuantizador</h1>
          {project && (
            <span className="text-sm text-gray-400 ml-4">{project.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project && (
            <>
              <button onClick={handleUndo} disabled={!canUndo()} className="p-2 rounded hover:bg-gray-700 disabled:opacity-30" title="Deshacer">
                <Undo2 size={18} />
              </button>
              <button onClick={handleRedo} disabled={!canRedo()} className="p-2 rounded hover:bg-gray-700 disabled:opacity-30" title="Rehacer">
                <Redo2 size={18} />
              </button>
              <div className="w-px h-6 bg-gray-600 mx-1" />
              <button onClick={handlePlay} className={`p-2 rounded ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`} title={isPlaying ? 'Detener' : 'Reproducir'}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button onClick={handleStop} className="p-2 rounded hover:bg-gray-700" title="Inicio">
                <Square size={18} />
              </button>
              <div className="flex items-center gap-1 ml-2">
                <Volume2 size={14} className="text-gray-400" />
                <input type="range" min="0" max="1" step="0.05" value={volume}
                  onChange={e => { setVolume(parseFloat(e.target.value)); audioEngine.setVolume(parseFloat(e.target.value)); }}
                  className="w-20 h-1 accent-indigo-500" />
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => setMetronomeOn(!metronomeOn)}
                  className={`p-1 rounded text-xs ${metronomeOn ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  title="Metrónomo"
                >
                  <Mic2 size={12} />
                </button>
                {metronomeOn && (
                  <input
                    type="number"
                    min={20}
                    max={300}
                    value={metronomeBpm}
                    onChange={e => setMetronomeBpm(parseInt(e.target.value) || 120)}
                    className="w-12 bg-gray-700 rounded px-1 py-0.5 text-xs"
                    title="BPM del metrónomo"
                  />
                )}
              </div>
              <div className="w-px h-6 bg-gray-600 mx-1" />
              <button onClick={handleSaveVersion} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1">
                <Save size={14} /> Guardar versión
              </button>
              <button onClick={handleExport} className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded flex items-center gap-1">
                <Download size={14} /> Exportar
              </button>
            </>
          )}
          {view === 'project' && (
            <button onClick={() => { setView('projects-list'); refreshProjectsList(); }} className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 rounded flex items-center gap-1">
              <FolderOpen size={14} /> Proyectos
            </button>
          )}
          {view !== 'project' && (
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1">
              <Upload size={14} /> Subir MIDI
            </button>
          )}
          <button onClick={() => setView('examples')} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1">
            <BookOpen size={14} /> Ejemplos
          </button>
          <button onClick={() => setView('help')} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1">
            <HelpCircle size={14} /> Ayuda
          </button>
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept=".mid,.midi" onChange={handleFileUpload} className="hidden" />

      {/* Main content */}
      {view === 'welcome' && <WelcomeView onUpload={() => fileInputRef.current?.click()} onOpenProjects={() => { setView('projects-list'); refreshProjectsList(); }} />}
      {view === 'projects-list' && <ProjectsListView projects={projectsList} onOpen={handleOpenProject} onDelete={handleDeleteProject} onNew={() => fileInputRef.current?.click()} />}
      {view === 'examples' && <ExamplesView onLoadExample={(p) => { setProject(p); saveProject(p); setView('project'); setActiveTab('diagnosis'); clearHistory(); notify(`Ejemplo cargado: ${p.name}`, 'success'); }} />}
      {view === 'help' && <HelpView onClose={() => setView(project ? 'project' : 'welcome')} />}
      {view === 'project' && project && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Track list */}
          <aside className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Layers size={14} /> Pistas
              </h3>
            </div>
            <div className="p-2">
              {project.tracks.map((track, idx) => (
                <div key={idx} className={`p-2 rounded mb-1 cursor-pointer transition-colors ${
                  selectedTrack === idx ? 'bg-indigo-900 border border-indigo-600' : 'hover:bg-gray-700'
                }`} onClick={() => setSelectedTrack(idx)}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{track.name}</span>
                    <span className="text-xs text-gray-400">{track.noteCount}n</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${track.isPercussion ? 'bg-orange-900 text-orange-300' : 'bg-gray-700 text-gray-400'}`}>
                      Ch {track.channel + 1}
                    </span>
                    <select
                      value={track.role}
                      onChange={e => toggleTrackRole(idx, e.target.value)}
                      className="text-xs bg-gray-700 border-0 rounded px-1 py-0.5 text-gray-300 flex-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="unassigned">Sin asignar</option>
                      <option value="percussion">Percusión</option>
                      <option value="bass">Bajo</option>
                      <option value="harmony">Armonía</option>
                      <option value="melody">Melodía</option>
                      <option value="strings">Cuerdas</option>
                      <option value="woodwinds">Madera</option>
                      <option value="brass">Metal</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Project info */}
            <div className="p-3 border-t border-gray-700">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">INFORMACIÓN</h4>
              <div className="text-xs text-gray-400 space-y-1">
                <p>Formato: MIDI tipo {project.format}</p>
                <p>Resolución: {project.ticksPerBeat} PPQN</p>
                <p>Compás: {project.timeSignatures[0]?.numerator}/{project.timeSignatures[0]?.denominator}</p>
                <p>Tempo: {project.tempoMap[0]?.bpm} BPM</p>
                <p>Duración: {project.totalDuration.toFixed(1)}s</p>
                <p>Pistas: {project.tracks.length}</p>
                <p>Notas: {project.tracks.reduce((s, t) => s + t.noteCount, 0)}</p>
              </div>
            </div>

            {/* Versions */}
            {project.versions.length > 0 && (
              <div className="p-3 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">VERSIONES</h4>
                <div className="text-xs text-gray-400 space-y-1">
                  {project.versions.map(v => (
                    <p key={v.id}>{v.name}</p>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Main area */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-700 bg-gray-800">
              {[
                { id: 'diagnosis' as Tab, label: 'Diagnóstico', icon: AlertTriangle },
                { id: 'piano-roll' as Tab, label: 'Piano Roll', icon: Grid3X3 },
                { id: 'bars' as Tab, label: 'Por compases', icon: Grid3X3 },
                { id: 'quantize' as Tab, label: 'Cuantización', icon: Settings },
                { id: 'editor' as Tab, label: 'Editor', icon: Scissors },
                { id: 'analysis' as Tab, label: 'Análisis', icon: BarChart3 },
                { id: 'instruments' as Tab, label: 'Instrumentos', icon: Piano },
                { id: 'recipes' as Tab, label: 'Recetas', icon: Wand2 },
                { id: 'mmc' as Tab, label: 'MMC', icon: Database },
                { id: 'score' as Tab, label: 'Score & Parts', icon: FileMusic },
                { id: 'export' as Tab, label: 'Exportar', icon: Download },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-300 bg-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto p-4">
              {activeTab === 'diagnosis' && <DiagnosisView project={project} issues={diagnosisIssues} onRunDiagnosis={() => setDiagnosisIssues(runFullDiagnosis(project))} />}
              {activeTab === 'piano-roll' && (
                <PianoRollView
                  project={project}
                  selectedTrack={selectedTrack}
                  canvasRef={pianoRollRef}
                  zoom={zoom}
                  setZoom={setZoom}
                  scrollX={scrollX}
                  setScrollX={setScrollX}
                  onClick={handlePianoRollClick}
                  comparisonMode={comparisonMode}
                  setComparisonMode={setComparisonMode}
                  currentTick={currentTick}
                  selectedNotes={selectedNotes}
                />
              )}
              {activeTab === 'bars' && <BarsView project={project} selectedTrack={selectedTrack} comparisonMode={comparisonMode} />}
              {activeTab === 'quantize' && (
                <QuantizeView
                  project={project}
                  onQuantize={handleQuantize}
                  onUndoQuantize={handleUndoQuantize}
                  onUpdateConfig={updateConfig}
                  result={quantizeResult}
                />
              )}
              {activeTab === 'editor' && (
                <EditorView
                  project={project}
                  selectedTrack={selectedTrack}
                  selectedNotes={selectedNotes}
                  setSelectedNotes={setSelectedNotes}
                  onApply={(newProject, msg) => { pushHistory(project, 'Antes de edición'); setProject(newProject); saveProject(newProject); setEditorMessage(msg); setTimeout(() => setEditorMessage(null), 3000); }}
                  editorMessage={editorMessage}
                />
              )}
              {activeTab === 'analysis' && <AnalysisView project={project} selectedTrack={selectedTrack} />}
              {activeTab === 'instruments' && <InstrumentsView project={project} selectedTrack={selectedTrack} />}
              {activeTab === 'recipes' && (
                <RecipesView
                  project={project}
                  onApply={(newProject) => { pushHistory(project, 'Antes de receta'); setProject(newProject); saveProject(newProject); notify('Receta aplicada', 'success'); }}
                />
              )}
              {activeTab === 'mmc' && (
                <MMCView
                  project={project}
                  mmcProject={mmcProject}
                  setMmcProject={setMmcProject}
                  mmcProcessing={mmcProcessing}
                  setMmcProcessing={setMmcProcessing}
                  notify={notify}
                />
              )}
              {activeTab === 'score' && (
                <ScoreView
                  project={project}
                  mmcProject={mmcProject}
                  extractionResult={extractionResult}
                  setExtractionResult={setExtractionResult}
                  scoreProcessing={scoreProcessing}
                  setScoreProcessing={setScoreProcessing}
                  notify={notify}
                />
              )}
              {activeTab === 'export' && <ExportView project={project} onExport={handleExport} />}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

// Welcome View
function WelcomeView({ onUpload, onOpenProjects }: { onUpload: () => void; onOpenProjects: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <Music className="mx-auto text-indigo-400 mb-6" size={64} />
        <h2 className="text-3xl font-bold text-white mb-4">MIDI Cuantizador Profesional</h2>
        <p className="text-gray-400 mb-8 text-lg">
          Analiza, cuantiza, revisa y exporta archivos MIDI con precisión musical.
          Corrige la colocación temporal conservando la identidad musical de la obra.
        </p>
        <div className="flex gap-4 justify-center">
          <button onClick={onUpload} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Upload size={20} /> Subir archivo MIDI
          </button>
          <button onClick={onOpenProjects} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <FolderOpen size={20} /> Abrir proyecto
          </button>
        </div>
        <div className="mt-12 grid grid-cols-3 gap-6 text-left">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-indigo-300 mb-2">Cuantización</h3>
            <p className="text-sm text-gray-400">Ajusta tiempos a rejilla con modos estricto, interpretativo y asistido.</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-emerald-300 mb-2">Diagnóstico</h3>
            <p className="text-sm text-gray-400">Detecta solapamientos, notas huérfanas, errores de estructura y más.</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-amber-300 mb-2">Exportación</h3>
            <p className="text-sm text-gray-400">MIDI verificado, informe legible y registro JSON de modificaciones.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Projects List View
function ProjectsListView({ projects, onOpen, onDelete, onNew }: { projects: MidiProject[]; onOpen: (id: string) => void; onDelete: (id: string) => void; onNew: () => void }) {
  return (
    <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Mis proyectos</h2>
        <button onClick={onNew} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2">
          <Upload size={16} /> Nuevo proyecto
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileAudio size={48} className="mx-auto mb-4 opacity-50" />
          <p>No hay proyectos guardados.</p>
          <p className="text-sm mt-2">Sube un archivo MIDI para comenzar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map(p => (
            <div key={p.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-750 border border-gray-700">
              <div className="flex-1 cursor-pointer" onClick={() => onOpen(p.id)}>
                <h3 className="font-medium text-white">{p.name}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {p.tracks.length} pistas · {p.tracks.reduce((s, t) => s + t.noteCount, 0)} notas · {p.totalDuration.toFixed(1)}s
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(p.updatedAt).toLocaleString('es-ES')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onOpen(p.id)} className="p-2 rounded hover:bg-gray-600 text-indigo-400">
                  <ChevronRight size={18} />
                </button>
                <button onClick={() => onDelete(p.id)} className="p-2 rounded hover:bg-red-900 text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Diagnosis View
function DiagnosisView({ project, issues, onRunDiagnosis }: { project: MidiProject; issues: EnhancedIssue[]; onRunDiagnosis: () => void }) {
  const displayIssues = issues.length > 0 ? issues : [];
  const summary = issues.length > 0 ? summarizeIssues(issues) : {};
  
  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <X className="text-red-400" size={14} />;
      case 'error': return <AlertTriangle className="text-red-400" size={14} />;
      case 'warning': return <AlertTriangle className="text-amber-400" size={14} />;
      default: return <Info className="text-blue-400" size={14} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-2xl font-bold text-white">{project.tracks.reduce((s, t) => s + t.noteCount, 0)}</p>
          <p className="text-sm text-gray-400">Notas totales</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-2xl font-bold text-amber-400">{project.issues.filter(i => i.severity === 'warning').length}</p>
          <p className="text-sm text-gray-400">Advertencias</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-2xl font-bold text-red-400">{project.issues.filter(i => i.severity === 'error' || i.severity === 'critical').length}</p>
          <p className="text-sm text-gray-400">Errores</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-2xl font-bold text-blue-400">{project.tracks.flatMap(t => t.notes).filter(n => n.isFlagged).length}</p>
          <p className="text-sm text-gray-400">Notas señaladas</p>
        </div>
      </div>

      {/* Missing info */}
      {(!project.missingInfo.hasTempo || !project.missingInfo.hasTimeSignature || !project.missingInfo.hasKeySignature) && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-300 mb-2">Información faltante</h3>
          <ul className="text-sm text-amber-200 space-y-1">
            {!project.missingInfo.hasTempo && <li>⚠ No se encontró tempo inicial. Se asume {project.missingInfo.assumedTempo} BPM.</li>}
            {!project.missingInfo.hasTimeSignature && <li>⚠ No se encontró indicación de compás. Se asume {project.missingInfo.assumedTimeSignature}.</li>}
            {!project.missingInfo.hasKeySignature && <li>⚠ No se encontró tonalidad.</li>}
          </ul>
        </div>
      )}

      {/* Enhanced diagnosis */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity size={18} /> Centro de diagnóstico musical
          </h3>
          <button onClick={onRunDiagnosis} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm flex items-center gap-1">
            <Activity size={14} /> Ejecutar diagnóstico
          </button>
        </div>
        
        {displayIssues.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {Object.entries(summary).map(([cat, count]) => (
                <div key={cat} className="bg-gray-700 rounded p-2 text-center">
                  <p className="text-lg font-bold text-white">{count}</p>
                  <p className="text-xs text-gray-400">{cat}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {displayIssues.slice(0, 20).map(issue => (
                <div key={issue.id} className="bg-gray-700 rounded p-2 border-l-2 border-indigo-500">
                  <div className="flex items-start gap-2">
                    {severityIcon(issue.severity)}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{issue.title}</p>
                      <p className="text-xs text-gray-300 mt-0.5">{issue.message}</p>
                      <p className="text-xs text-gray-500 mt-1 italic">{issue.explanation}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {issue.actions.map((action, i) => (
                          <span key={i} className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-gray-300">{action}</span>
                        ))}
                      </div>
                      {issue.barNumber && <span className="text-xs text-gray-500">Compás {issue.barNumber}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {displayIssues.length > 20 && (
                <p className="text-xs text-gray-500 text-center">...y {displayIssues.length - 20} incidencias más</p>
              )}
            </div>
          </>
        )}
        
        {displayIssues.length === 0 && issues.length === 0 && (
          <p className="text-sm text-gray-400">Pulsa "Ejecutar diagnóstico" para un análisis completo.</p>
        )}
      </div>

      {/* Issues list */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Incidencias del archivo ({project.issues.length})</h3>
        {project.issues.length === 0 ? (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
            <p className="text-green-300 flex items-center gap-2"><CheckCircle size={16} /> Sin incidencias detectadas.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {project.issues.map(issue => (
              <div key={issue.id} className="bg-gray-800 rounded-lg p-3 flex items-start gap-3">
                {severityIcon(issue.severity)}
                <div className="flex-1">
                  <p className="text-sm text-gray-200">{issue.message}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>Categoría: {issue.category}</span>
                    {issue.trackIndex !== undefined && <span>Pista: {issue.trackIndex + 1}</span>}
                    {issue.tick !== undefined && <span>Tick: {issue.tick}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Track details */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Detalle por pistas</h3>
        <div className="space-y-2">
          {project.tracks.map(track => (
            <div key={track.index} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">{track.name}</span>
                <span className="text-sm text-gray-400">{track.noteCount} notas</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                <span>Canal {track.channel + 1}</span>
                {track.program !== undefined && <span>Programa: {track.program}</span>}
                <span>Función: {track.role}</span>
                <span>Polifonía: {track.polyphony}</span>
                {track.isPercussion && <span className="text-orange-400">Percusión</span>}
              </div>
              {track.notes.filter(n => n.isFlagged).length > 0 && (
                <p className="text-xs text-amber-400 mt-1">{track.notes.filter(n => n.isFlagged).length} notas señaladas</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Piano Roll View
function PianoRollView({ project, selectedTrack, canvasRef, zoom, setZoom, scrollX, setScrollX, onClick, comparisonMode, setComparisonMode, currentTick, selectedNotes }: {
  project: MidiProject;
  selectedTrack: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  zoom: number;
  setZoom: (z: number) => void;
  scrollX: number;
  setScrollX: (x: number) => void;
  onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  comparisonMode: 'corrected' | 'original';
  setComparisonMode: (m: 'corrected' | 'original') => void;
  currentTick: number;
  selectedNotes: Set<string>;
}) {
  const track = project.tracks[selectedTrack];
  const modifiedCount = track?.notes.filter(n => n.isModified).length || 0;
  const flaggedCount = track?.notes.filter(n => n.isFlagged).length || 0;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setZoom(Math.min(10, zoom * 1.5))} className="p-1.5 rounded hover:bg-gray-700" title="Acercar">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom(Math.max(0.5, zoom / 1.5))} className="p-1.5 rounded hover:bg-gray-700" title="Alejar">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => setScrollX(0)} className="p-1.5 rounded hover:bg-gray-700" title="Inicio">
            <SkipBack size={16} />
          </button>
          <button onClick={() => setScrollX(Math.max(0, project.totalTicks - project.totalTicks / zoom))} className="p-1.5 rounded hover:bg-gray-700" title="Final">
            <SkipForward size={16} />
          </button>
          <span className="text-xs text-gray-400">Zoom: {zoom.toFixed(1)}x</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Comparar:</span>
            <button
              onClick={() => setComparisonMode('original')}
              className={`px-2 py-1 text-xs rounded ${comparisonMode === 'original' ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              Original
            </button>
            <button
              onClick={() => setComparisonMode('corrected')}
              className={`px-2 py-1 text-xs rounded ${comparisonMode === 'corrected' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              Corregido
            </button>
          </div>
          <div className="text-xs text-gray-400">
            <span className="text-emerald-400">■</span> Modificadas: {modifiedCount}
            <span className="ml-2 text-red-400">■</span> Señaladas: {flaggedCount}
            <span className="ml-2 text-yellow-400">■</span> Seleccionadas: {selectedNotes.size}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
        <canvas
          ref={canvasRef as any}
          width={1200}
          height={400}
          className="w-full cursor-crosshair"
          onClick={onClick}
        />
      </div>

      {/* Scrollbar */}
      <div className="bg-gray-800 rounded-lg p-2">
        <input
          type="range"
          min={0}
          max={project.totalTicks}
          value={scrollX}
          onChange={e => setScrollX(parseInt(e.target.value))}
          className="w-full h-2 accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Tick {scrollX}</span>
          <span>Tick {Math.min(scrollX + project.totalTicks / zoom, project.totalTicks)}</span>
          <span>Total: {project.totalTicks} ticks</span>
        </div>
      </div>

      {/* Selected notes info */}
      {selectedNotes.size > 0 && (
        <div className="bg-gray-800 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-white mb-2">Notas seleccionadas ({selectedNotes.size})</h4>
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-300">
            {track?.notes.filter(n => selectedNotes.has(n.id)).slice(0, 20).map(note => (
              <div key={note.id} className="bg-gray-700 rounded p-2">
                <p>Pitch: {note.pitch} ({getNoteName(note.pitch)})</p>
                <p>Inicio: {note.startTick} → {note.correctedStartTick}</p>
                <p>Vel: {note.velocity}</p>
                {note.isModified && <p className="text-emerald-400">Modificada</p>}
                {note.isFlagged && <p className="text-red-400">{note.flagReason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Bars View
function BarsView({ project, selectedTrack, comparisonMode }: { project: MidiProject; selectedTrack: number; comparisonMode: 'corrected' | 'original' }) {
  const track = project.tracks[selectedTrack];
  if (!track) return <p className="text-gray-400">Selecciona una pista.</p>;

  const timeSig = project.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const ticksPerBeat = project.ticksPerBeat;
  const ticksPerBar = timeSig.numerator * ticksPerBeat;
  const totalBars = Math.ceil(project.totalTicks / ticksPerBar);
  const gridDivision = project.quantizeConfig.gridDivision;
  const positionsPerBar = timeSig.numerator * (gridDivision / 4);

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-3">
        <h3 className="text-sm font-semibold text-white mb-2">
          Vista por compases — {track.name}
        </h3>
        <p className="text-xs text-gray-400">
          Compás: {timeSig.numerator}/{timeSig.denominator} · Rejilla: 1/{gridDivision} · 
          Posiciones por compás: {positionsPerBar}
        </p>
      </div>

      <div className="max-h-[600px] overflow-y-auto space-y-2">
        {Array.from({ length: Math.min(totalBars, 100) }, (_, barIdx) => {
          const barStartTick = barIdx * ticksPerBar;
          const barEndTick = barStartTick + ticksPerBar;
          
          const notesInBar = track.notes.filter(n => {
            const start = comparisonMode === 'corrected' ? n.correctedStartTick : n.startTick;
            return start >= barStartTick && start < barEndTick;
          });

          return (
            <div key={barIdx} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">Compás {barIdx + 1}</span>
                <span className="text-xs text-gray-400">{notesInBar.length} notas</span>
              </div>
              <div className="flex gap-px">
                {Array.from({ length: positionsPerBar }, (_, posIdx) => {
                  const posTick = barStartTick + (posIdx * ticksPerBar) / positionsPerBar;
                  const notesAtPos = notesInBar.filter(n => {
                    const start = comparisonMode === 'corrected' ? n.correctedStartTick : n.startTick;
                    return Math.abs(start - posTick) < (ticksPerBar / positionsPerBar) / 2;
                  });

                  const isBeat = posIdx % (gridDivision / 4) === 0;

                  return (
                    <div
                      key={posIdx}
                      className={`flex-1 min-w-[8px] h-12 rounded-sm flex flex-col justify-end items-center relative ${
                        isBeat ? 'bg-gray-600' : 'bg-gray-700'
                      } ${notesAtPos.length > 0 ? 'border border-indigo-500' : ''}`}
                      title={`Pos ${posIdx + 1}${notesAtPos.length > 0 ? `: ${notesAtPos.map(n => getNoteName(n.pitch)).join(', ')}` : ''}`}
                    >
                      {notesAtPos.map((note, ni) => (
                        <div
                          key={note.id}
                          className={`w-full text-center text-[8px] leading-tight ${
                            note.isFlagged ? 'bg-red-600' : note.isModified ? 'bg-emerald-600' : 'bg-indigo-500'
                          } ${ni > 0 ? 'mt-px' : ''}`}
                        >
                          {getNoteName(note.pitch)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Quantize View
function QuantizeView({ project, onQuantize, onUndoQuantize, onUpdateConfig, result }: {
  project: MidiProject;
  onQuantize: () => void;
  onUndoQuantize: () => void;
  onUpdateConfig: (updates: Partial<QuantizeConfig>) => void;
  result: string | null;
}) {
  const config = project.quantizeConfig;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Configuración de cuantización</h3>
        
        {/* Mode */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-300 block mb-2">Modo</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'strict', label: 'ESTRICTO', desc: 'Ajusta ataques a la rejilla exacta' },
              { value: 'interpretive', label: 'INTERPRETATIVO', desc: 'Reduce desviaciones manteniendo expresión' },
              { value: 'assisted', label: 'ASISTIDO', desc: 'Propone opciones para revisión manual' },
            ].map(mode => (
              <button
                key={mode.value}
                onClick={() => onUpdateConfig({ mode: mode.value as any })}
                className={`p-3 rounded-lg text-left border transition-colors ${
                  config.mode === mode.value
                    ? 'border-indigo-500 bg-indigo-900/30'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-sm font-semibold text-white">{mode.label}</span>
                <p className="text-xs text-gray-400 mt-1">{mode.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1">Rejilla</label>
            <select
              value={config.gridDivision}
              onChange={e => onUpdateConfig({ gridDivision: parseInt(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            >
              <option value={4}>Negras (1/4)</option>
              <option value={8}>Corcheas (1/8)</option>
              <option value={16}>Semicorcheas (1/16)</option>
              <option value={32}>Fusas (1/32)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1">Intensidad: {config.strength}%</label>
            <input
              type="range"
              min={1}
              max={100}
              value={config.strength}
              onChange={e => onUpdateConfig({ strength: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1">Desplazamiento máximo (ticks): {config.maxDisplacement}</label>
            <input
              type="range"
              min={1}
              max={project.ticksPerBeat * 4}
              value={config.maxDisplacement}
              onChange={e => onUpdateConfig({ maxDisplacement: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1">Swing: {config.swingAmount}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={config.swingAmount}
              onChange={e => onUpdateConfig({ swingAmount: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={config.useTriplets}
              onChange={e => onUpdateConfig({ useTriplets: e.target.checked })}
              className="accent-indigo-500"
            />
            Incluir tresillos
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={config.quantizeAttacksOnly}
              onChange={e => onUpdateConfig({ quantizeAttacksOnly: e.target.checked })}
              className="accent-indigo-500"
            />
            Solo ataques
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={config.normalizeDuration}
              onChange={e => onUpdateConfig({ normalizeDuration: e.target.checked })}
              className="accent-indigo-500"
            />
            Normalizar duración
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={config.preserveSelected}
              onChange={e => onUpdateConfig({ preserveSelected: e.target.checked })}
              className="accent-indigo-500"
            />
            Proteger notas seleccionadas
          </label>
        </div>

        {/* Tracks */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-300 block mb-2">Pistas a procesar</label>
          <div className="flex flex-wrap gap-2">
            {project.tracks.map(track => (
              <label key={track.index} className="flex items-center gap-1 text-xs bg-gray-700 rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={config.trackIndices.includes(track.index)}
                  onChange={e => {
                    const newIndices = e.target.checked
                      ? [...config.trackIndices, track.index]
                      : config.trackIndices.filter(i => i !== track.index);
                    onUpdateConfig({ trackIndices: newIndices });
                  }}
                  className="accent-indigo-500"
                />
                {track.name}
              </label>
            ))}
          </div>
        </div>

        {/* Collision policy */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-300 block mb-1">Política de colisiones</label>
          <select
            value={config.collisionPolicy}
            onChange={e => onUpdateConfig({ collisionPolicy: e.target.value as any })}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="flag">Señalar para revisión</option>
            <option value="keep_first">Mantener primera nota</option>
            <option value="keep_closest">Mantener la más cercana a la rejilla</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onQuantize}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium flex items-center gap-2"
          >
            <Settings size={16} /> Procesar cuantización
          </button>
          <button
            onClick={onUndoQuantize}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-2"
          >
            <Undo2 size={16} /> Deshacer cuantización
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-4 bg-emerald-900/30 border border-emerald-700 rounded-lg p-3">
            <p className="text-sm text-emerald-300">{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Export View
function ExportView({ project, onExport }: { project: MidiProject; onExport: () => void }) {
  const modifiedNotes = project.tracks.flatMap(t => t.notes.filter(n => n.isModified));
  const flaggedNotes = project.tracks.flatMap(t => t.notes.filter(n => n.isFlagged));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Exportar resultado</h3>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-700 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{project.tracks.reduce((s, t) => s + t.noteCount, 0)}</p>
            <p className="text-xs text-gray-400">Notas totales</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{modifiedNotes.length}</p>
            <p className="text-xs text-gray-400">Notas modificadas</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{flaggedNotes.length}</p>
            <p className="text-xs text-gray-400">Notas señaladas</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <p className="text-sm text-gray-300">Se exportarán los siguientes archivos:</p>
          <ul className="text-sm text-gray-400 space-y-1 ml-4">
            <li>• <strong>{project.name}_procesado.mid</strong> — Archivo MIDI con correcciones aplicadas</li>
            <li>• <strong>{project.name}_informe.txt</strong> — Informe legible de modificaciones</li>
            <li>• <strong>{project.name}_informe.json</strong> — Registro estructurado JSON</li>
          </ul>
        </div>

        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-300 flex items-center gap-2">
            <Info size={14} />
            El MIDI exportado se verifica automáticamente re-leyendo el archivo para confirmar integridad.
          </p>
        </div>

        <button
          onClick={onExport}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium flex items-center gap-2"
        >
          <Download size={18} /> Exportar MIDI e informes
        </button>
      </div>
    </div>
  );
}

// Utility
function getNoteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

// Editor View
function EditorView({ project, selectedTrack, selectedNotes, setSelectedNotes, onApply, editorMessage }: {
  project: MidiProject;
  selectedTrack: number;
  selectedNotes: Set<string>;
  setSelectedNotes: (s: Set<string>) => void;
  onApply: (project: MidiProject, msg: string) => void;
  editorMessage: string | null;
}) {
  const [semitones, setSemitones] = useState(0);
  const [octaves, setOctaves] = useState(0);
  const [divisions, setDivisions] = useState(2);
  const [newVelocity, setNewVelocity] = useState(80);
  const [moveOffset, setMoveOffset] = useState(0);
  const [dupOffset, setDupOffset] = useState(480);
  const [velMin, setVelMin] = useState(40);
  const [velMax, setVelMax] = useState(120);
  
  const track = project.tracks[selectedTrack];
  if (!track) return <p className="text-gray-400">Selecciona una pista.</p>;
  
  const handleTranspose = () => {
    if (selectedNotes.size === 0) return;
    const result = transposeNotes(project, selectedTrack, selectedNotes, semitones);
    onApply(result.project, result.description);
  };
  
  const handleTransposeOctave = () => {
    if (selectedNotes.size === 0) return;
    const result = transposeOctave(project, selectedTrack, selectedNotes, octaves);
    onApply(result.project, result.description);
  };
  
  const handleDivide = () => {
    if (selectedNotes.size !== 1) return;
    const noteId = Array.from(selectedNotes)[0];
    const result = divideNote(project, selectedTrack, noteId, divisions);
    onApply(result.project, result.description);
    setSelectedNotes(new Set());
  };
  
  const handleJoin = () => {
    if (selectedNotes.size < 2) return;
    const result = joinNotes(project, selectedTrack, Array.from(selectedNotes));
    onApply(result.project, result.description);
    setSelectedNotes(new Set());
  };
  
  const handleEditVelocity = () => {
    if (selectedNotes.size === 0) return;
    const result = editVelocity(project, selectedTrack, selectedNotes, newVelocity);
    onApply(result.project, result.description);
  };
  
  const handleMove = () => {
    if (selectedNotes.size === 0) return;
    const result = moveNotes(project, selectedTrack, selectedNotes, moveOffset);
    onApply(result.project, result.description);
  };
  
  const handleDuplicate = () => {
    if (selectedNotes.size === 0) return;
    const result = duplicateFragment(project, selectedTrack, selectedNotes, dupOffset);
    onApply(result.project, result.description);
  };
  
  const handleProtect = () => {
    if (selectedNotes.size === 0) return;
    const result = toggleProtection(project, selectedTrack, selectedNotes, true);
    onApply(result.project, result.description);
  };
  
  const handleNormalizeVel = () => {
    if (selectedNotes.size === 0) return;
    const result = normalizeVelocity(project, selectedTrack, selectedNotes, velMin, velMax);
    onApply(result.project, result.description);
  };
  
  const handleDelete = () => {
    if (selectedNotes.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedNotes.size} notas? Esta acción se puede deshacer.`)) return;
    const result = deleteNotes(project, selectedTrack, selectedNotes);
    onApply(result.project, result.description);
    setSelectedNotes(new Set());
  };
  
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Scissors size={18} /> Editor musical
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Selecciona notas en el Piano Roll para editarlas. Las transformaciones afectan solo a la selección.
        </p>
        
        {editorMessage && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded p-2 mb-4">
            <p className="text-sm text-emerald-300">{editorMessage}</p>
          </div>
        )}
        
        <div className="bg-blue-900/20 border border-blue-700 rounded p-2 mb-4">
          <p className="text-xs text-blue-300">
            <Info size={12} className="inline mr-1" />
            Seleccionadas: {selectedNotes.size} notas en pista "{track.name}"
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Transposition */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><ArrowUpDown size={14} /> Transposición</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20">Semitonos:</label>
                <input type="number" value={semitones} onChange={e => setSemitones(parseInt(e.target.value) || 0)} className="w-20 bg-gray-600 rounded px-2 py-1 text-sm" />
                <button onClick={handleTranspose} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Aplicar</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20">Octavas:</label>
                <input type="number" value={octaves} onChange={e => setOctaves(parseInt(e.target.value) || 0)} className="w-20 bg-gray-600 rounded px-2 py-1 text-sm" />
                <button onClick={handleTransposeOctave} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Aplicar</button>
              </div>
            </div>
          </div>
          
          {/* Division/Join */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><Scissors size={14} /> Dividir / Unir</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20">Divisiones:</label>
                <input type="number" min={2} max={8} value={divisions} onChange={e => setDivisions(parseInt(e.target.value) || 2)} className="w-20 bg-gray-600 rounded px-2 py-1 text-sm" />
                <button onClick={handleDivide} disabled={selectedNotes.size !== 1} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Dividir</button>
              </div>
              <button onClick={handleJoin} disabled={selectedNotes.size < 2} className="w-full px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50 flex items-center gap-1 justify-center">
                <Link2 size={12} /> Unir notas seleccionadas
              </button>
            </div>
          </div>
          
          {/* Move */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><Move size={14} /> Desplazar</h4>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 w-20">Ticks:</label>
              <input type="number" value={moveOffset} onChange={e => setMoveOffset(parseInt(e.target.value) || 0)} className="w-24 bg-gray-600 rounded px-2 py-1 text-sm" />
              <button onClick={handleMove} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Mover</button>
            </div>
          </div>
          
          {/* Duplicate */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><Copy size={14} /> Duplicar</h4>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 w-20">Offset:</label>
              <input type="number" value={dupOffset} onChange={e => setDupOffset(parseInt(e.target.value) || 0)} className="w-24 bg-gray-600 rounded px-2 py-1 text-sm" />
              <button onClick={handleDuplicate} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Duplicar</button>
            </div>
          </div>
          
          {/* Velocity */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><Type size={14} /> Velocidad</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20">Valor:</label>
                <input type="number" min={1} max={127} value={newVelocity} onChange={e => setNewVelocity(parseInt(e.target.value) || 80)} className="w-20 bg-gray-600 rounded px-2 py-1 text-sm" />
                <button onClick={handleEditVelocity} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Fijar</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20">Rango:</label>
                <input type="number" min={1} max={127} value={velMin} onChange={e => setVelMin(parseInt(e.target.value) || 40)} className="w-14 bg-gray-600 rounded px-2 py-1 text-sm" />
                <span className="text-xs text-gray-400">a</span>
                <input type="number" min={1} max={127} value={velMax} onChange={e => setVelMax(parseInt(e.target.value) || 120)} className="w-14 bg-gray-600 rounded px-2 py-1 text-sm" />
                <button onClick={handleNormalizeVel} disabled={selectedNotes.size === 0} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs disabled:opacity-50">Norm.</button>
              </div>
            </div>
          </div>
          
          {/* Protection/Delete */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><Shield size={14} /> Protección</h4>
            <div className="space-y-2">
              <button onClick={handleProtect} disabled={selectedNotes.size === 0} className="w-full px-2 py-1 bg-amber-600 hover:bg-amber-700 rounded text-xs disabled:opacity-50 flex items-center gap-1 justify-center">
                <Shield size={12} /> Proteger selección
              </button>
              <button onClick={handleDelete} disabled={selectedNotes.size === 0} className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs disabled:opacity-50 flex items-center gap-1 justify-center">
                <Trash2 size={12} /> Eliminar selección
              </button>
            </div>
          </div>
        </div>
        
        {/* Help */}
        <div className="mt-4 bg-gray-700 rounded p-3">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><HelpCircle size={14} /> Ayuda del editor</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• <strong>Seleccionar notas:</strong> clic en el Piano Roll (Shift+clic para múltiple)</li>
            <li>• <strong>Transposición:</strong> cambia la altura sin alterar el ritmo</li>
            <li>• <strong>Dividir:</strong> parte una nota en N partes iguales</li>
            <li>• <strong>Unir:</strong> fusiona notas consecutivas de igual altura</li>
            <li>• <strong>Proteger:</strong> las notas protegidas no se modifican en cuantizaciones posteriores</li>
            <li>• Todas las operaciones se pueden deshacer con Ctrl+Z</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Analysis View
function AnalysisView({ project, selectedTrack }: { project: MidiProject; selectedTrack: number }) {
  const track = project.tracks[selectedTrack];
  if (!track || track.notes.length === 0) return <p className="text-gray-400">Selecciona una pista con notas para analizar.</p>;
  
  const pitchDist = analyzePitchDistribution(track);
  const rhythm = analyzeRhythm(track, project);
  const keyEst = estimateKey(track);
  
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 size={18} /> Análisis musical — {track.name}
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Pitch Distribution */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-indigo-300 mb-2">Distribución de alturas</h4>
            <div className="space-y-1 text-xs text-gray-300">
              <p>Mínimo: {analysisGetNoteName(pitchDist.min)} ({pitchDist.min})</p>
              <p>Máximo: {analysisGetNoteName(pitchDist.max)} ({pitchDist.max})</p>
              <p>Media: {analysisGetNoteName(Math.round(pitchDist.mean))} ({pitchDist.mean.toFixed(1)})</p>
              <p>Mediana: {analysisGetNoteName(pitchDist.median)}</p>
              <p>Moda: {analysisGetNoteName(pitchDist.mode)}</p>
              <p>Extensión: {pitchDist.range} semitonos</p>
            </div>
          </div>
          
          {/* Rhythm */}
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-emerald-300 mb-2">Análisis rítmico</h4>
            <div className="space-y-1 text-xs text-gray-300">
              <p>Duración media: {rhythm.avgDuration.toFixed(0)} ticks</p>
              <p>Duración mínima: {rhythm.minDuration} ticks</p>
              <p>Duración máxima: {rhythm.maxDuration} ticks</p>
              <p>Densidad media: {(rhythm.densityPerBar.reduce((a, b) => a + b, 0) / rhythm.densityPerBar.length).toFixed(1)} notas/compás</p>
              <p>Desviación media: {rhythm.avgDisplacement.toFixed(1)} ticks</p>
              <p>Desviación máxima: {rhythm.maxDisplacement} ticks</p>
            </div>
          </div>
          
          {/* Key estimation */}
          <div className="bg-gray-700 rounded p-3 col-span-2">
            <h4 className="text-sm font-semibold text-amber-300 mb-2">Estimación de tonalidad</h4>
            {keyEst ? (
              <div className="space-y-1">
                <p className="text-sm text-white">
                  Tonalidad estimada: <strong>{keyEst.key} {keyEst.scale === 'major' ? 'mayor' : 'menor'}</strong>
                </p>
                <p className="text-xs text-gray-400">Confianza: {keyEst.confidence}</p>
                <p className="text-xs text-gray-400 italic">{keyEst.evidence}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Nota: Esta estimación se basa en el perfil de Krumhansl-Schmuckler. Es orientativa y puede no coincidir con la tonalidad real de la obra, especialmente en música modal, atonal o con modulaciones frecuentes.
                </p>
                {/* Pitch class distribution */}
                <div className="flex gap-1 mt-2">
                  {keyEst.pitchClassDistribution.map((count, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-indigo-600 rounded-t" style={{ height: `${(count / Math.max(...keyEst.pitchClassDistribution)) * 40}px` }}></div>
                      <span className="text-[9px] text-gray-500 mt-0.5">{['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No hay suficientes notas para estimar la tonalidad (mínimo 8).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Instruments View
function InstrumentsView({ project, selectedTrack }: { project: MidiProject; selectedTrack: number }) {
  const [filterFamily, setFilterFamily] = useState<string>('all');
  const families = getAllFamilies();
  
  const filteredInstruments = filterFamily === 'all' 
    ? INSTRUMENT_CATALOG 
    : INSTRUMENT_CATALOG.filter(i => i.family === filterFamily);
  
  const currentTrack = project.tracks[selectedTrack];
  const currentInstrument = currentTrack?.program !== undefined ? getInstrumentByProgram(currentTrack.program) : null;
  
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Piano size={18} /> Catálogo de instrumentos
        </h3>
        
        {currentTrack && (
          <div className="bg-indigo-900/30 border border-indigo-700 rounded p-3 mb-4">
            <p className="text-sm text-indigo-300">
              Pista actual: <strong>{currentTrack.name}</strong>
              {currentInstrument && (
                <> — {currentInstrument.name} ({currentInstrument.family})
                {currentInstrument.isTransposing && ` · Transpositor: ${currentInstrument.writtenToConcert > 0 ? '+' : ''}${currentInstrument.writtenToConcert} semitonos`}
                · Registro: {analysisGetNoteName(currentInstrument.minPitch)}–{analysisGetNoteName(currentInstrument.maxPitch)}
                </>
              )}
              {!currentInstrument && currentTrack.program !== undefined && ` — Programa ${currentTrack.program}`}
              {currentTrack.isPercussion && ' — Percusión (canal 10)'}
            </p>
          </div>
        )}
        
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm text-gray-400">Familia:</label>
          <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm">
            <option value="all">Todas</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-700 sticky top-0">
              <tr>
                <th className="text-left p-2 text-gray-300">Prog.</th>
                <th className="text-left p-2 text-gray-300">Nombre</th>
                <th className="text-left p-2 text-gray-300">Familia</th>
                <th className="text-left p-2 text-gray-300">Transp.</th>
                <th className="text-left p-2 text-gray-300">Registro</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstruments.map(inst => (
                <tr key={inst.program} className={`border-t border-gray-700 ${currentTrack?.program === inst.program ? 'bg-indigo-900/30' : 'hover:bg-gray-700'}`}>
                  <td className="p-2 text-gray-400">{inst.program}</td>
                  <td className="p-2 text-white">{inst.name}</td>
                  <td className="p-2 text-gray-400">{inst.family}</td>
                  <td className="p-2 text-gray-400">
                    {inst.isTransposing ? `${inst.writtenToConcert > 0 ? '+' : ''}${inst.writtenToConcert}` : '—'}
                  </td>
                  <td className="p-2 text-gray-400">{analysisGetNoteName(inst.minPitch)}–{analysisGetNoteName(inst.maxPitch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 bg-gray-700 rounded p-3">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1"><HelpCircle size={14} /> Sobre instrumentos transpositores</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Un instrumento transpositor suena a diferente altura de lo escrito</li>
            <li>• Ej: Trompeta en Si♭ suena un tono abajo de lo escrito</li>
            <li>• El cambio de timbre NO transpone las notas automáticamente</li>
            <li>• La transposición visual no altera el MIDI exportado</li>
            <li>• Para transponer realmente, usa el Editor → Transposición</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Recipes View
function RecipesView({ project, onApply }: { project: MidiProject; onApply: (project: MidiProject) => void }) {
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [preview, setPreview] = useState<{ steps: string[]; warnings: string[] } | null>(null);
  const [result, setResult] = useState<{ stepResults: { step: any; result: string }[]; warnings: string[] } | null>(null);
  
  const recipes = getAllRecipes();
  
  const handleSelectRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setPreview(previewRecipe(project, recipe));
    setResult(null);
  };
  
  const handleExecute = () => {
    if (!selectedRecipe) return;
    const execResult = executeRecipe(project, selectedRecipe);
    setResult({ stepResults: execResult.stepResults, warnings: execResult.warnings });
    onApply(execResult.project);
  };
  
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Wand2 size={18} /> Recetas de procesamiento
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Las recetas son cadenas de operaciones que se ejecutan en orden. Se pueden guardar y reutilizar.
        </p>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          {recipes.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => handleSelectRecipe(recipe)}
              className={`p-3 rounded-lg text-left border transition-colors ${
                selectedRecipe?.id === recipe.id
                  ? 'border-indigo-500 bg-indigo-900/30'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-700'
              }`}
            >
              <span className="text-sm font-semibold text-white">{recipe.name}</span>
              <p className="text-xs text-gray-400 mt-1">{recipe.description}</p>
              <p className="text-xs text-gray-500 mt-1">{recipe.steps.length} pasos {recipe.isBuiltIn ? '(integrada)' : '(personalizada)'}</p>
            </button>
          ))}
        </div>
        
        {preview && selectedRecipe && (
          <div className="bg-gray-700 rounded p-3 mb-4">
            <h4 className="text-sm font-semibold text-white mb-2">Vista previa: {selectedRecipe.name}</h4>
            <ol className="space-y-1 mb-3">
              {preview.steps.map((step, i) => (
                <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-mono">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {preview.warnings.length > 0 && (
              <div className="bg-amber-900/30 border border-amber-700 rounded p-2 mb-3">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
                ))}
              </div>
            )}
            <button onClick={handleExecute} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm flex items-center gap-2">
              <Wand2 size={14} /> Ejecutar receta
            </button>
          </div>
        )}
        
        {result && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded p-3">
            <h4 className="text-sm font-semibold text-emerald-300 mb-2">Resultado</h4>
            {result.stepResults.map((sr, i) => (
              <p key={i} className="text-xs text-gray-300">✓ {sr.step.label}: {sr.result}</p>
            ))}
            {result.warnings.length > 0 && (
              <div className="mt-2">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-300">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Examples View
function ExamplesView({ onLoadExample }: { onLoadExample: (p: MidiProject) => void }) {
  const [filter, setFilter] = useState<'all' | 'didactic' | 'validation'>('all');
  
  const filtered = filter === 'all' ? EXAMPLES : getExamplesByCategory(filter);
  
  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <BookOpen size={24} /> Biblioteca de ejemplos
      </h2>
      <p className="text-gray-400 mb-6">
        Ejemplos MIDI originales generados para la herramienta. Cada ejemplo tiene un objetivo específico y parámetros sugeridos.
      </p>
      
      <div className="flex gap-2 mb-6">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded text-sm ${filter === 'all' ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Todos</button>
        <button onClick={() => setFilter('didactic')} className={`px-3 py-1.5 rounded text-sm ${filter === 'didactic' ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Didácticos</button>
        <button onClick={() => setFilter('validation')} className={`px-3 py-1.5 rounded text-sm ${filter === 'validation' ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Validación</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(example => (
          <div key={example.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-indigo-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-white">{example.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${example.category === 'didactic' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}`}>
                  {example.category === 'didactic' ? 'Didáctico' : 'Validación'}
                </span>
              </div>
              <button
                onClick={() => onLoadExample(example.generate())}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm"
              >
                Cargar
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">{example.description}</p>
            <p className="text-xs text-gray-500 mt-1"><strong>Objetivo:</strong> {example.objective}</p>
            <p className="text-xs text-gray-500 mt-1"><strong>Rejilla:</strong> 1/{example.suggestedParams.gridDivision} · <strong>Modo:</strong> {example.suggestedParams.mode}</p>
            <p className="text-xs text-emerald-400 mt-1"><strong>Resultado esperado:</strong> {example.expectedResult}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Help View
function HelpView({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState('intro');
  
  const sections = [
    { id: 'intro', title: 'Introducción' },
    { id: 'workflow', title: 'Flujo de trabajo' },
    { id: 'quantize', title: 'Cuantización' },
    { id: 'bars16', title: 'Las 16 posiciones' },
    { id: 'editor', title: 'Editor' },
    { id: 'tutorials', title: 'Tutoriales' },
    { id: 'shortcuts', title: 'Atajos' },
  ];
  
  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <HelpCircle size={24} /> Ayuda
        </h2>
        <button onClick={onClose} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Cerrar</button>
      </div>
      
      <div className="flex gap-6">
        <nav className="w-48 flex-shrink-0">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`block w-full text-left px-3 py-2 rounded text-sm mb-1 ${
                activeSection === s.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>
        
        <div className="flex-1 bg-gray-800 rounded-lg p-6">
          {activeSection === 'intro' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">¿Qué es MIDI Cuantizador?</h3>
              <p>Una herramienta para analizar, cuantizar, revisar y exportar archivos MIDI con precisión musical.</p>
              <p>La herramienta distingue tres tipos de operaciones:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Cuantización:</strong> ajustar tiempos a una rejilla definida</li>
                <li><strong>Reparación:</strong> corregir errores técnicos verificables</li>
                <li><strong>Reconstrucción asistida:</strong> proponer interpretaciones cuando la información es ambigua</li>
              </ul>
              <p className="bg-amber-900/30 border border-amber-700 rounded p-2 text-xs text-amber-200">
                <strong>Importante:</strong> Nunca se presenta una reconstrucción incierta como una corrección demostrada. La precisión matemática de la rejilla no garantiza la fidelidad musical.
              </p>
            </div>
          )}
          
          {activeSection === 'workflow' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Flujo de trabajo</h3>
              <ol className="list-decimal list-inside space-y-2">
                <li><strong>Crear o abrir proyecto:</strong> sube un archivo MIDI o carga un ejemplo</li>
                <li><strong>Consultar diagnóstico:</strong> revisa las incidencias detectadas</li>
                <li><strong>Revisar instrumentos:</strong> asigna la función musical de cada pista</li>
                <li><strong>Seleccionar pistas y compases:</strong> define el ámbito de trabajo</li>
                <li><strong>Configurar cuantización:</strong> elige modo, rejilla e intensidad</li>
                <li><strong>Procesar:</strong> aplica la cuantización</li>
                <li><strong>Comparar:</strong> alterna entre original y corregido</li>
                <li><strong>Resolver incidencias:</strong> revisa notas señaladas</li>
                <li><strong>Aprobar versión:</strong> guarda el resultado</li>
                <li><strong>Exportar:</strong> descarga MIDI e informes</li>
              </ol>
            </div>
          )}
          
          {activeSection === 'quantize' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Modos de cuantización</h3>
              <div className="space-y-3">
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-indigo-300">ESTRICTO</h4>
                  <p className="text-xs mt-1">Ajusta ataques exactamente a la rejilla seleccionada. Ideal para bases rítmicas y percusión.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-emerald-300">INTERPRETATIVO</h4>
                  <p className="text-xs mt-1">Reduce desviaciones manteniendo una proporción de la expresión original. Ideal para melodías.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-amber-300">ASISTIDO</h4>
                  <p className="text-xs mt-1">Propone opciones para fragmentos ambiguos y requiere revisión antes de aplicarlas.</p>
                </div>
              </div>
              <p className="bg-blue-900/20 border border-blue-700 rounded p-2 text-xs text-blue-200">
                Las notas que superen el desplazamiento máximo permitido quedarán sin modificar y señaladas.
              </p>
            </div>
          )}
          
          {activeSection === 'bars16' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Las 16 posiciones de un compás 4/4</h3>
              <p>En un compás de 4/4 con rejilla de semicorcheas hay 16 posiciones posibles de inicio. Pero <strong>16 posiciones no significa 16 notas obligatorias</strong>.</p>
              <div className="bg-gray-700 rounded p-3">
                <p className="text-xs">Ejemplos:</p>
                <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                  <li>Una blanca ocupa 8 posiciones pero es UN solo ataque</li>
                  <li>Un silencio de negra ocupa 4 posiciones sin ningún ataque</li>
                  <li>Un acorde de 4 notas en un pulso usa 1 posición para 4 ataques simultáneos</li>
                  <li>4 semicorcheas usan 4 posiciones diferentes</li>
                </ul>
              </div>
              <p className="bg-amber-900/30 border border-amber-700 rounded p-2 text-xs text-amber-200">
                La plantilla por compases muestra las posiciones disponibles, no impone ataques en todas ellas.
              </p>
            </div>
          )}
          
          {activeSection === 'editor' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Editor musical</h3>
              <p>El editor permite transformar notas seleccionadas sin afectar al resto de la obra.</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Transposición:</strong> cambia alturas por semitonos u octavas</li>
                <li><strong>División:</strong> parte una nota en N partes iguales</li>
                <li><strong>Unión:</strong> fusiona notas consecutivas de igual altura</li>
                <li><strong>Duplicación:</strong> copia un fragmento desplazado en el tiempo</li>
                <li><strong>Edición de velocidad:</strong> ajusta dinámica individual o por rango</li>
                <li><strong>Protección:</strong> marca notas para que no sean modificadas en cuantizaciones</li>
              </ul>
              <p className="text-xs text-gray-400 mt-2">
                Todas las operaciones se pueden deshacer con el botón Deshacer.
              </p>
            </div>
          )}
          
          {activeSection === 'tutorials' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Tutoriales prácticos</h3>
              <div className="space-y-3">
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white">1. Corregir una melodía a semicorcheas</h4>
                  <p className="text-xs mt-1">Carga el ejemplo "Semicorcheas regulares". Configura rejilla 1/16, modo estricto, fuerza 100%. Pulsa "Procesar cuantización". Verifica en el Piano Roll que todas las notas están alineadas.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white">2. Conservar acordes</h4>
                  <p className="text-xs mt-1">Carga "Acordes simultáneos". Los acordes ya están simultáneos. La cuantización estricta los mantiene así porque todos los ataques están en la misma posición. Verifica en la vista por compases.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white">3. Trabajar con tresillos</h4>
                  <p className="text-xs mt-1">Carga "Tresillos". Activa la opción "Incluir tresillos" en la configuración. Usa rejilla de corcheas. Los tresillos se cuantizan a su rejilla ternaria propia.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white">4. Revisar clusters</h4>
                  <p className="text-xs mt-1">Carga "Clusters ambiguos". Ejecuta el diagnóstico. Las notas aparecerán señaladas. Usa el modo asistido para que se propongan opciones sin aplicarlas automáticamente.</p>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <h4 className="font-semibold text-white">5. Comparar original y resultado</h4>
                  <p className="text-xs mt-1">Tras cuantizar, usa los botones "Original" y "Corregido" en el Piano Roll para alternar. Las notas modificadas aparecen en verde. Reproduce ambos para comparar.</p>
                </div>
              </div>
            </div>
          )}
          
          {activeSection === 'shortcuts' && (
            <div className="space-y-3 text-sm text-gray-300">
              <h3 className="text-lg font-semibold text-white">Atajos de teclado</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-gray-700"><td className="py-1 text-gray-400">Espacio</td><td>Reproducir / Pausar</td></tr>
                  <tr className="border-b border-gray-700"><td className="py-1 text-gray-400">Escape</td><td>Detener reproducción</td></tr>
                  <tr className="border-b border-gray-700"><td className="py-1 text-gray-400">Clic en Piano Roll</td><td>Seleccionar nota</td></tr>
                  <tr className="border-b border-gray-700"><td className="py-1 text-gray-400">Shift+Clic</td><td>Selección múltiple</td></tr>
                  <tr className="border-b border-gray-700"><td className="py-1 text-gray-400">Clic en espacio vacío</td><td>Mover cabezal de reproducción</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// MMC View
function MMCView({ project, mmcProject, setMmcProject, mmcProcessing, setMmcProcessing, notify }: {
  project: MidiProject;
  mmcProject: MMCProjectType | null;
  setMmcProject: (m: MMCProjectType | null) => void;
  mmcProcessing: boolean;
  setMmcProcessing: (p: boolean) => void;
  notify: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [testResults, setTestResults] = useState<{ name: string; passed: boolean; message: string }[] | null>(null);

  const handleBuildMMC = () => {
    setMmcProcessing(true);
    setTimeout(() => {
      try {
        const result = processWithMMC(project);
        setMmcProject(result.mmc);
        notify(`MMC construida: ${result.summary.totalEvents} eventos, ${result.summary.validatedEvents} validados`, 'success');
      } catch (e) {
        notify(`Error al construir MMC: ${(e as Error).message}`, 'error');
      }
      setMmcProcessing(false);
    }, 100);
  };

  const handleRunTests = () => {
    const results = runAllTests();
    setTestResults(results);
    const passed = results.filter(r => r.passed).length;
    notify(`Tests: ${passed}/${results.length} aprobados`, passed === results.length ? 'success' : 'info');
  };

  const summary = mmcProject ? generateExportSummary(mmcProject) : null;
  const verification = mmcProject ? verifyBeforeExport(mmcProject) : null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Database size={18} /> Matriz Maestra de Conversión (MMC v1.0)
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Single Source of Truth musical. Analiza, cuantiza, corrige y reconstruye con trazabilidad completa.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleBuildMMC}
            disabled={mmcProcessing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded text-sm flex items-center gap-2"
          >
            <Database size={14} /> {mmcProcessing ? 'Procesando...' : mmcProject ? 'Reconstruir MMC' : 'Construir MMC'}
          </button>
          <button
            onClick={handleRunTests}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm flex items-center gap-2"
          >
            <TestTube size={14} /> Ejecutar tests
          </button>
        </div>

        {mmcProject && summary && (
          <div className="bg-gray-700 rounded p-3 mb-4">
            <h4 className="text-sm font-semibold text-white mb-2">Estado de la MMC</h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-gray-400">Eventos totales:</span> <span className="text-white font-mono">{summary.totalEvents}</span></div>
              <div><span className="text-gray-400">Validados:</span> <span className="text-emerald-400 font-mono">{summary.validatedEvents}</span></div>
              <div><span className="text-gray-400">Requieren revisión:</span> <span className="text-amber-400 font-mono">{summary.reviewRequiredEvents}</span></div>
              <div><span className="text-gray-400">Overrides humanos:</span> <span className="text-blue-400 font-mono">{summary.humanOverrideEvents}</span></div>
              <div><span className="text-gray-400">Clusters sospechosos:</span> <span className="text-red-400 font-mono">{summary.suspectClusters}</span></div>
              <div><span className="text-gray-400">Pistas:</span> <span className="text-white font-mono">{mmcProject.tracks.length}</span></div>
            </div>
          </div>
        )}

        {verification && verification.issues.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-700 rounded p-3 mb-4">
            <h4 className="text-sm font-semibold text-amber-300 mb-2">Advertencias pre-exportación</h4>
            <ul className="text-xs text-amber-200 space-y-1">
              {verification.issues.map((issue, i) => <li key={i}>⚠ {issue}</li>)}
            </ul>
          </div>
        )}

        {mmcProject && (
          <div className="bg-gray-700 rounded p-3 mb-4">
            <h4 className="text-sm font-semibold text-white mb-2">Pistas en MMC</h4>
            <div className="space-y-1 text-xs">
              {mmcProject.tracks.map(track => (
                <div key={track.track_id} className="flex items-center justify-between bg-gray-600 rounded px-2 py-1">
                  <span className="text-white">{track.name}</span>
                  <div className="flex gap-2 text-gray-400">
                    <span>Capa: <span className="text-indigo-300">{track.layer.replace('L', 'L').replace('_', ' ')}</span></span>
                    <span>Eventos: <span className="text-white font-mono">{track.event_ids.length}</span></span>
                    <span>Compases: <span className="text-white font-mono">{track.measures.length}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mmcProject && mmcProject.log.length > 0 && (
          <div className="bg-gray-700 rounded p-3">
            <h4 className="text-sm font-semibold text-white mb-2">Log de operaciones</h4>
            <div className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono">
              {mmcProject.log.slice(-20).map((entry, i) => (
                <div key={i} className={`${
                  entry.level === 'ERROR' ? 'text-red-400' :
                  entry.level === 'WARN' ? 'text-amber-400' :
                  entry.level === 'INFO' ? 'text-blue-300' : 'text-gray-400'
                }`}>
                  [{entry.level}] {entry.module}: {entry.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {testResults && (
          <div className="bg-gray-700 rounded p-3 mt-4">
            <h4 className="text-sm font-semibold text-white mb-2">Tests obligatorios (Sección 22)</h4>
            <div className="space-y-1">
              {testResults.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs p-1 rounded ${r.passed ? 'bg-emerald-900/20' : 'bg-red-900/20'}`}>
                  <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <div>
                    <p className="text-white font-medium">{r.name}</p>
                    <p className="text-gray-400">{r.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Score & Parts View
function ScoreView({ project, mmcProject, extractionResult, setExtractionResult, scoreProcessing, setScoreProcessing, notify }: {
  project: MidiProject;
  mmcProject: MMCProjectType | null;
  extractionResult: ExtractionResultType | null;
  setExtractionResult: (r: ExtractionResultType | null) => void;
  scoreProcessing: boolean;
  setScoreProcessing: (p: boolean) => void;
  notify: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [scoreTests, setScoreTests] = useState<{ name: string; passed: boolean; message: string }[] | null>(null);

  const handleExtractScoreAndParts = () => {
    if (!mmcProject) {
      notify('Primero debes construir la MMC', 'error');
      return;
    }

    setScoreProcessing(true);
    setTimeout(() => {
      try {
        const metadata = {
          title: project.name,
          subtitle: null,
          composer: null,
          arranger: null,
          lyricist: null,
          copyright: null,
          movementNumber: null,
          movementTitle: null,
          workNumber: null,
          opus: null,
          source: null,
          encoding_date: new Date().toISOString(),
          encoder: 'MIDIExtremPlus MMC v1.0',
          description: null,
        };

        const structure = {
          segno_measure: null,
          coda_measure: null,
          fine_measure: null,
          dacapo: false,
          dalsegno: false,
          tocoda: null,
          repeat_starts: [],
          repeat_ends: [],
          endings: [],
        };

        const result = extractScoreAndParts(mmcProject, metadata, structure);
        setExtractionResult(result);
        notify(`Score y ${result.parts.length} particellas extraídas`, 'success');
      } catch (e) {
        notify(`Error al extraer: ${(e as Error).message}`, 'error');
      }
      setScoreProcessing(false);
    }, 100);
  };

  const handleExportFullScore = () => {
    if (!extractionResult?.score) {
      notify('Primero extrae el score', 'error');
      return;
    }

    const musicxml = exportFullScoreToMusicXML(extractionResult.score);
    downloadMusicXML(musicxml, `${project.name}_FULL_SCORE.musicxml`);
    notify('Full Score exportado como MusicXML', 'success');
  };

  const handleExportAllParts = () => {
    if (!extractionResult?.parts || extractionResult.parts.length === 0) {
      notify('Primero extrae las particellas', 'error');
      return;
    }

    for (const part of extractionResult.parts) {
      const musicxml = exportPartToMusicXMLString(part);
      const filename = `${project.name}_${part.instrument_name.replace(/\s+/g, '_')}.musicxml`;
      downloadMusicXML(musicxml, filename);
    }
    notify(`${extractionResult.parts.length} particellas exportadas`, 'success');
  };

  const handleExportSinglePart = (part: IndividualPartType) => {
    const musicxml = exportPartToMusicXMLString(part);
    const filename = `${project.name}_${part.instrument_name.replace(/\s+/g, '_')}.musicxml`;
    downloadMusicXML(musicxml, filename);
    notify(`Particella de ${part.instrument_name} exportada`, 'success');
  };

  const handleRunScoreTests = () => {
    const results = runAllScoreTests();
    setScoreTests(results);
    const passed = results.filter(r => r.passed).length;
    notify(`Tests Score: ${passed}/${results.length} aprobados`, passed === results.length ? 'success' : 'info');
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <FileMusic size={18} /> Score & Parts
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Extrae particellas individuales y Full Conductor Score desde la MMC validada.
        </p>

        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={handleExtractScoreAndParts}
            disabled={scoreProcessing || !mmcProject}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded text-sm flex items-center gap-2"
          >
            <Users size={14} /> {scoreProcessing ? 'Extrayendo...' : 'Extraer Score y Parts'}
          </button>
          <button
            onClick={handleExportFullScore}
            disabled={!extractionResult?.score}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded text-sm flex items-center gap-2"
          >
            <Download size={14} /> Export Full Score (MusicXML)
          </button>
          <button
            onClick={handleExportAllParts}
            disabled={!extractionResult?.parts || extractionResult.parts.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm flex items-center gap-2"
          >
            <Download size={14} /> Export All Parts
          </button>
          <button
            onClick={handleRunScoreTests}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm flex items-center gap-2"
          >
            <TestTube size={14} /> Tests Score
          </button>
        </div>

        {!mmcProject && (
          <div className="bg-amber-900/30 border border-amber-700 rounded p-3 mb-4">
            <p className="text-sm text-amber-300">
              <AlertTriangle size={14} className="inline mr-1" />
              Debes construir la MMC primero (pestaña MMC) antes de extraer score y parts.
            </p>
          </div>
        )}

        {extractionResult && (
          <>
            <div className="bg-gray-700 rounded p-3 mb-4">
              <h4 className="text-sm font-semibold text-white mb-2">Estadísticas de extracción</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-gray-400">Instrumentos:</span> <span className="text-white font-mono">{extractionResult.stats.total_instruments}</span></div>
                <div><span className="text-gray-400">Compases:</span> <span className="text-white font-mono">{extractionResult.stats.total_measures}</span></div>
                <div><span className="text-gray-400">Eventos totales:</span> <span className="text-white font-mono">{extractionResult.stats.total_events}</span></div>
                <div><span className="text-gray-400">Eventos derivados:</span> <span className="text-blue-400 font-mono">{extractionResult.stats.derived_events}</span></div>
                <div><span className="text-gray-400">Requieren revisión:</span> <span className="text-amber-400 font-mono">{extractionResult.stats.instruments_review_required}</span></div>
              </div>
            </div>

            {extractionResult.warnings.length > 0 && (
              <div className="bg-amber-900/30 border border-amber-700 rounded p-3 mb-4">
                <h4 className="text-sm font-semibold text-amber-300 mb-2">Advertencias</h4>
                <ul className="text-xs text-amber-200 space-y-1">
                  {extractionResult.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                </ul>
              </div>
            )}

            {extractionResult.errors.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded p-3 mb-4">
                <h4 className="text-sm font-semibold text-red-300 mb-2">Errores</h4>
                <ul className="text-xs text-red-200 space-y-1">
                  {extractionResult.errors.map((e, i) => <li key={i}>✗ {e}</li>)}
                </ul>
              </div>
            )}

            {extractionResult.score && (
              <div className="bg-gray-700 rounded p-3 mb-4">
                <h4 className="text-sm font-semibold text-white mb-2">Full Conductor Score</h4>
                <div className="text-xs text-gray-300 space-y-1">
                  <p>Compases: {extractionResult.score.total_measures}</p>
                  <p>Instrumentos: {extractionResult.score.all_instruments.length}</p>
                  <p>Grupos: {extractionResult.score.groups.map(g => g.name).join(', ')}</p>
                </div>
              </div>
            )}

            {extractionResult.parts.length > 0 && (
              <div className="bg-gray-700 rounded p-3">
                <h4 className="text-sm font-semibold text-white mb-2">Particellas individuales</h4>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {extractionResult.parts.map(part => (
                    <div key={part.id} className="flex items-center justify-between bg-gray-600 rounded px-2 py-1 text-xs">
                      <div>
                        <span className="text-white">{part.instrument_name}</span>
                        <span className="text-gray-400 ml-2">
                          ({part.note_count} notas, {part.total_measures} compases)
                        </span>
                        {part.instrument.review_required && (
                          <span className="text-amber-400 ml-2">⚠ Revisar</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleExportSinglePart(part)}
                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                      >
                        Exportar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {scoreTests && (
          <div className="bg-gray-700 rounded p-3 mt-4">
            <h4 className="text-sm font-semibold text-white mb-2">Tests Score & Parts</h4>
            <div className="space-y-1">
              {scoreTests.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs p-1 rounded ${r.passed ? 'bg-emerald-900/20' : 'bg-red-900/20'}`}>
                  <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <div>
                    <p className="text-white font-medium">{r.name}</p>
                    <p className="text-gray-400">{r.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
