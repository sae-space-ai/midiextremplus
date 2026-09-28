import { useState, useEffect, useRef, useCallback } from 'react';
import { parseMidiFile } from './midi/parser';
import { quantizeProject } from './midi/quantize';
import { writeMidiFile, verifyMidiExport, generateReport, generateJsonReport } from './midi/writer';
import { MidiProject, QuantizeConfig } from './midi/model';
import { audioEngine } from './audio/engine';
import { saveProject, loadProject, loadAllProjects, deleteProject, pushHistory, undo, redo, canUndo, canRedo, clearHistory, saveVersion } from './store/project';
import { Upload, Play, Pause, Square, Download, Undo2, Redo2, Settings, Music, AlertTriangle, CheckCircle, Info, X, ChevronRight, Layers, Grid3X3, Volume2, Save, FolderOpen, Trash2, FileAudio, ZoomIn, ZoomOut, SkipBack, SkipForward } from 'lucide-react';

type View = 'welcome' | 'project' | 'projects-list';
type Tab = 'diagnosis' | 'piano-roll' | 'bars' | 'quantize' | 'export';

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
      setIsPlaying(false);
    } else {
      audioEngine.setProject(project);
      audioEngine.setUseCorrected(comparisonMode === 'corrected');
      audioEngine.setVolume(volume);
      await audioEngine.play(currentTick);
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
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
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept=".mid,.midi" onChange={handleFileUpload} className="hidden" />

      {/* Main content */}
      {view === 'welcome' && <WelcomeView onUpload={() => fileInputRef.current?.click()} onOpenProjects={() => { setView('projects-list'); refreshProjectsList(); }} />}
      {view === 'projects-list' && <ProjectsListView projects={projectsList} onOpen={handleOpenProject} onDelete={handleDeleteProject} onNew={() => fileInputRef.current?.click()} />}
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
              {activeTab === 'diagnosis' && <DiagnosisView project={project} />}
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
function DiagnosisView({ project }: { project: MidiProject }) {
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

      {/* Issues list */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Incidencias ({project.issues.length})</h3>
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

export default App;
