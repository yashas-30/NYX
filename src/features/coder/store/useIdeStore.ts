import { create } from 'zustand';

export interface OpenFile {
  path: string;
  content: string;
  isDirty: boolean;
}

interface IdeState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  fileTree: any[];
  setFileTree: (tree: any[]) => void;
  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileClean: (path: string) => void;
}

export const useIdeStore = create<IdeState>((set) => ({
  openFiles: [],
  activeFilePath: null,
  fileTree: [],
  setFileTree: (fileTree) => set({ fileTree }),
  openFile: (path, content) =>
    set((state) => {
      const exists = state.openFiles.find((f) => f.path === path);
      if (exists) {
        return { activeFilePath: path };
      }
      return {
        openFiles: [...state.openFiles, { path, content, isDirty: false }],
        activeFilePath: path,
      };
    }),
  closeFile: (path) =>
    set((state) => {
      const filtered = state.openFiles.filter((f) => f.path !== path);
      const newActive =
        state.activeFilePath === path
          ? filtered.length > 0
            ? filtered[filtered.length - 1].path
            : null
          : state.activeFilePath;
      return { openFiles: filtered, activeFilePath: newActive };
    }),
  setActiveFile: (path) => set({ activeFilePath: path }),
  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),
  markFileClean: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) => (f.path === path ? { ...f, isDirty: false } : f)),
    })),
}));
