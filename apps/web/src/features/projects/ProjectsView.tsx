import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, FolderOpen, FileText, FileCode, FileImage, FileJson, Plus, Trash2, Edit3, Search, Upload, ChevronRight, ChevronDown, GitBranch, MessageSquare, Settings, BrainCircuit, Palette
} from 'lucide-react';

const ProjectIcon = ({ icon, className = "w-5 h-5 text-primary" }: { icon: string; className?: string }) => {
  if (icon === '🎨') {
    return <AnimatedIcon icon={Palette} className={className} />;
  }
  return <AnimatedIcon icon={Folder} className={className} />;
};
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { toast } from '@src/shared/components/ui/sonner';
import { useProjectStore, Project, ProjectFile } from '@src/shared/store/useProjectStore';

const FILE_ICONS = {
  text: FileText,
  code: FileCode,
  image: FileImage,
  json: FileJson,
  doc: FileText,
};

export default function ProjectsView() {
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const activeProjectIdFromStore = useNyxStore((s) => s.activeProjectId);
  const activeProject = projects.find(p => p.id === activeProjectIdFromStore) || null;

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  const setActiveProjectId = useNyxStore((s) => s.setActiveProjectId);
  const setActiveMode = useNyxStore((s) => s.setActiveMode);

  const addProject = useProjectStore((s) => s.addProject);
  const deleteProjectStore = useProjectStore((s) => s.deleteProject);
  const saveFileToProject = useProjectStore((s) => s.saveFileToProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const newProject = {
      name: newProjectName,
      description: newProjectDesc,
      icon: '📁',
      model: 'gemini-2.5-flash',
      instructions: '',
      sessions: [],
      files: [],
    };
    await addProject(newProject);
    setNewProjectName('');
    setNewProjectDesc('');
    setIsCreating(false);
  };

  const deleteProject = (projectId: string) => {
    if (!confirm('Delete this project? All files and chat history will be lost.')) return;
    deleteProjectStore(projectId);
    if (activeProjectIdFromStore === projectId) setActiveProjectId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeProject) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const extension = file.name.split('.').pop() || '';
        
        let contentType: 'code' | 'json' | 'image' | 'text' = 'code';
        if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(extension.toLowerCase())) {
          contentType = 'image';
        } else if (['json'].includes(extension.toLowerCase())) {
          contentType = 'json';
        } else if (['txt', 'md'].includes(extension.toLowerCase())) {
          contentType = 'text';
        }

        const newFile: ProjectFile = {
          id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: 'file',
          contentType,
          size: `${Math.round((file.size / 1024) * 10) / 10} KB`,
          modified: 'Just now',
          content: text || '',
        };

        saveFileToProject(activeProject.id, newFile);

        toast.success(`Uploaded "${file.name}" to project.`);
      };
      reader.readAsText(file);
    });
  };

  const deleteFile = (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    if (activeProject) {
      const filterFiles = (list: ProjectFile[]): ProjectFile[] => {
        return list
          .filter((f) => f.id !== fileId)
          .map((f) => {
            if (f.type === 'folder' && f.children) {
              return { ...f, children: filterFiles(f.children) };
            }
            return f;
          });
      };
      updateProject(activeProject.id, { files: filterFiles(activeProject.files) });
    }
    setSelectedFile(null);
    toast.success('File removed from project.');
  };

  const startProjectChat = () => {
    if (!activeProject) return;
    setActiveProjectId(activeProject.id);
    setActiveMode('chat');
    toast.success(`Started chat workspace scoped to ${activeProject.name}`);
  };

  const rankedSearchResults = useMemo(() => {
    if (!fileSearchQuery.trim() || !activeProject) return null;
    const query = fileSearchQuery.toLowerCase();
    const results: { file: ProjectFile; score: number }[] = [];

    const indexFiles = (filesList: ProjectFile[]) => {
      filesList.forEach((file) => {
        if (file.type === 'file') {
          let score = 0;
          const nameMatch = file.name.toLowerCase().includes(query);
          const contentMatch = file.content?.toLowerCase().includes(query);

          if (nameMatch) score += 15;
          if (contentMatch) {
            const occurrences = (file.content!.toLowerCase().match(new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
            score += Math.min(25, occurrences * 3);
          }

          if (score > 0) {
            results.push({ file, score });
          }
        } else if (file.type === 'folder' && file.children) {
          indexFiles(file.children);
        }
      });
    };

    indexFiles(activeProject.files);
    return results.sort((a, b) => b.score - a.score).map((r) => r.file);
  }, [fileSearchQuery, activeProject]);

  const renderFileTree = (files: ProjectFile[], depth = 0) => {
    return files.map((file) => {
      const isExpanded = expandedFolders.has(file.id);
      const isSelected = selectedFile?.id === file.id;
      const Icon = file.type === 'folder'
        ? (isExpanded ? FolderOpen : Folder)
        : (FILE_ICONS[file.contentType || 'text'] || FileText);
      const colorClass = file.type === 'folder'
        ? 'text-amber-500'
        : file.contentType === 'code'
        ? 'text-blue-400'
        : file.contentType === 'image'
        ? 'text-purple-400'
        : 'text-muted-foreground';

      return (
        <div key={file.id} style={{ paddingLeft: depth * 16 }}>
          <div
            onClick={() => {
              if (file.type === 'folder') {
                toggleFolder(file.id);
              } else {
                setSelectedFile(file);
              }
            }}
            className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all text-xs ${
              isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'
            }`}
          >
            {file.type === 'folder' && (
              <span className="text-muted-foreground">
                {isExpanded ? <AnimatedIcon icon={ChevronDown} size={12} /> : <AnimatedIcon icon={ChevronRight} size={12} />}
              </span>
            )}
            <Icon size={14} className={colorClass} />
            <span className="flex-1 truncate">{file.name}</span>
            {file.size && <span className="text-muted-foreground text-[10px]">{file.size}</span>}
          </div>
          {file.type === 'folder' && isExpanded && file.children && (
            <div className="mt-0.5">
              {renderFileTree(file.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={Folder} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Projects</h1>
              <p className="text-xs text-muted-foreground">
                {projects.length} projects · {projects.reduce((acc, p) => acc + p.sessions.length, 0)} chat sessions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <AnimatedIcon icon={Search} size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-56 pl-8 pr-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all cursor-pointer"
            >
              <AnimatedIcon icon={Plus} size={14} /> New Project
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Projects List */}
        <div className="w-72 border-r border-border overflow-y-auto p-4 space-y-2 shrink-0">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => {
                setActiveProjectId(project.id);
                setSelectedFile(null);
                setFileSearchQuery('');
              }}
              className={`p-3 rounded-lg cursor-pointer transition-all border ${
                activeProject?.id === project.id
                  ? 'bg-primary/5 border-primary/30'
                  : 'hover:bg-muted border-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                <ProjectIcon icon={project.icon} className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">{project.name}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <AnimatedIcon icon={MessageSquare} size={9} /> {project.sessions.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <AnimatedIcon icon={FileText} size={9} /> {project.files.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Active Project */}
        <div className="flex-1 flex overflow-hidden">
          {activeProject ? (
            <>
              {/* File Tree & Tools */}
              <div className="w-72 border-r border-border flex flex-col shrink-0">
                <div className="shrink-0 p-3 border-b border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <ProjectIcon icon={activeProject.icon} className="w-5 h-5 text-primary shrink-0" />
                    <h2 className="text-sm font-semibold text-foreground truncate">{activeProject.name}</h2>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={startProjectChat}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
                      >
                        <AnimatedIcon icon={MessageSquare} size={12} /> Chat in Project
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowInstructions(!showInstructions)}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-border transition-all cursor-pointer ${
                          showInstructions ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <AnimatedIcon icon={BrainCircuit} size={10} /> Instructions
                      </button>
                      <label className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-muted/40 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border transition-all cursor-pointer">
                        <AnimatedIcon icon={Upload} size={10} /> Upload Files
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  {/* File Search */}
                  <div className="p-2 border-b border-border bg-muted/10 shrink-0">
                    <div className="relative">
                      <AnimatedIcon icon={Search} size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        type="text"
                        value={fileSearchQuery}
                        onChange={(e) => setFileSearchQuery(e.target.value)}
                        placeholder="Search files..."
                        className="w-full pl-7 pr-3 py-1.5 rounded-md bg-muted border border-border text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2">
                    {showInstructions && (
                      <div className="mb-3 p-2 bg-muted/40 border border-border/50 rounded-lg">
                        <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase block mb-1">Custom instructions</span>
                        <textarea
                          value={activeProject.instructions}
                          onChange={(e) => {
                            updateProject(activeProject.id, { instructions: e.target.value });
                          }}
                          placeholder="Project-scoped instructions for the AI..."
                          className="w-full h-20 p-2 rounded bg-background border border-border text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none font-medium"
                        />
                      </div>
                    )}

                    {rankedSearchResults ? (
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-primary/70 uppercase tracking-widest block px-2 mb-1.5">Ranked Search Results</span>
                        {rankedSearchResults.map((file) => (
                          <div
                            key={file.id}
                            onClick={() => setSelectedFile(file)}
                            className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all text-xs ${
                              selectedFile?.id === file.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'
                            }`}
                          >
                            <AnimatedIcon icon={FileCode} size={14} className="text-blue-400" />
                            <span className="flex-1 truncate">{file.name}</span>
                          </div>
                        ))}
                        {rankedSearchResults.length === 0 && (
                          <span className="text-[10px] text-muted-foreground/60 italic block px-2 py-1">No term matches found.</span>
                        )}
                      </div>
                    ) : (
                      renderFileTree(activeProject.files)
                    )}
                  </div>
                </div>
              </div>

              {/* File Preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedFile ? (
                  <>
                    <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AnimatedIcon icon={FileText} size={14} className="text-primary" />
                        <span className="text-sm font-semibold text-foreground">{selectedFile.name}</span>
                        <span className="text-[10px] text-muted-foreground">{selectedFile.size}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteFile(selectedFile.id)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all cursor-pointer"
                        >
                          <AnimatedIcon icon={Trash2} size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
                      <pre className="text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
                        {selectedFile.content || 'File is empty.'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <AnimatedIcon icon={FolderOpen} size={48} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">Select a file to preview</p>
                      <p className="text-xs mt-1 opacity-60">Files are stored per-project and shared across chat sessions</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AnimatedIcon icon={Folder} size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a project</p>
                <p className="text-xs mt-1 opacity-60">Create or select a project to manage files and context</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsCreating(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[480px] bg-card border border-border rounded-xl p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Create New Project</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Project Name</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Website Redesign"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                  <textarea
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    placeholder="What is this project about?"
                    className="w-full h-20 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createProject}
                    disabled={!newProjectName.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Project
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
