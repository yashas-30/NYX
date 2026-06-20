import { create } from 'zustand';

export interface ProjectFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  contentType?: 'text' | 'code' | 'image' | 'json' | 'doc';
  children?: ProjectFile[];
  size?: string;
  modified?: string;
  content?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  files: ProjectFile[];
  instructions: string;
  model: string;
  sessions: string[];
}

export interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  setActiveProject: (id: string | null) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  saveFileToProject: (projectId: string, newFile: ProjectFile) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  activeProjectId: null,
  isLoading: false,
  
  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/v1/workspace/projects');
      if (res.ok) {
        const data = await res.json();
        set({ projects: data });
      }
    } catch (e) {
      console.error('Failed to fetch projects', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  addProject: async (project) => {
    try {
      const res = await fetch('/api/v1/workspace/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      if (res.ok) {
        const newProj = await res.json();
        set((state) => ({ projects: [...state.projects, newProj] }));
      }
    } catch (e) {
      console.error('Failed to add project', e);
    }
  },

  deleteProject: async (id) => {
    try {
      const res = await fetch(`/api/v1/workspace/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      }
    } catch (e) {
      console.error('Failed to delete project', e);
    }
  },

  updateProject: async (id, updates) => {
    try {
      const res = await fetch(`/api/v1/workspace/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          projects: state.projects.map((p) => p.id === id ? updated : p),
        }));
      }
    } catch (e) {
      console.error('Failed to update project', e);
    }
  },

  saveFileToProject: async (projectId, newFile) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedFiles = [...project.files];
    const existingIdx = updatedFiles.findIndex((f) => f.name === newFile.name);
    if (existingIdx > -1) {
      updatedFiles[existingIdx] = { ...updatedFiles[existingIdx], ...newFile };
    } else {
      updatedFiles.push(newFile);
    }

    await get().updateProject(projectId, { files: updatedFiles });
  }
}));
