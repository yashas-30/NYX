import React, { useState, useEffect } from 'react';
import { SettingsIcon as Settings, PlusIcon as Plus, Trash2Icon as Trash2, CheckIcon as Check, XIcon as X } from '@animateicons/react/lucide';
import { Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@src/shared/components/ui/sonner';

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
}

export const PromptTemplateManager: React.FC<{
  onSelectTemplate: (content: string) => void;
}> = ({ onSelectTemplate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });

  useEffect(() => {
    const saved = localStorage.getItem('nyx_prompt_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse templates', e);
      }
    }
  }, []);

  const saveTemplates = (newTemplates: PromptTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('nyx_prompt_templates', JSON.stringify(newTemplates));
  };

  const handleAdd = () => {
    setIsEditing('new');
    setEditForm({ title: '', content: '' });
  };

  const handleSave = () => {
    if (!editForm.title || !editForm.content) {
      toast.error('Title and content are required');
      return;
    }
    
    if (isEditing === 'new') {
      const newTemplate = { id: Date.now().toString(), ...editForm };
      saveTemplates([...templates, newTemplate]);
      toast.success('Template added');
    } else {
      const newTemplates = templates.map((t) =>
        t.id === isEditing ? { ...t, ...editForm } : t
      );
      saveTemplates(newTemplates);
      toast.success('Template updated');
    }
    setIsEditing(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveTemplates(templates.filter((t) => t.id !== id));
    toast.success('Template deleted');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all"
        title="Prompt Templates"
      >
        <Settings size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 left-0 w-80 bg-popover border border-border rounded-md shadow-sm overflow-hidden z-50"
          >
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
              <span className="text-xs font-semibold text-foreground">Prompt Templates</span>
              <button onClick={handleAdd} className="text-emerald-400 hover:text-emerald-300 active:scale-[0.97] transition-all">
                <Plus size={14} />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto p-2">
              {isEditing && (
                <div className="mb-2 p-2 bg-muted/20 rounded-md border border-border">
                  <input
                    type="text"
                    placeholder="Title"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full bg-transparent border-b border-border text-xs text-foreground p-1 mb-2 outline-none focus:border-primary/50"
                  />
                  <textarea
                    placeholder="Prompt content..."
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    className="w-full bg-input border border-border rounded text-xs text-foreground p-2 min-h-[60px] outline-none focus:border-primary/50 resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setIsEditing(null)} className="text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all">
                      <X size={14} />
                    </button>
                    <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-300 active:scale-[0.97] transition-all">
                      <Check size={14} />
                    </button>
                  </div>
                </div>
              )}

              {!isEditing && templates.length === 0 && (
                <div className="text-center p-4 text-xs text-muted-foreground">
                  No templates saved.
                </div>
              )}

              {!isEditing && templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    onSelectTemplate(t.content);
                    setIsOpen(false);
                  }}
                  className="group flex items-center justify-between p-2 hover:bg-muted/40 rounded-md cursor-pointer transition-colors mb-1"
                >
                  <div className="truncate text-xs text-foreground/80">{t.title}</div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditForm({ title: t.title, content: t.content });
                        setIsEditing(t.id);
                      }}
                      className="text-muted-foreground hover:text-primary active:scale-[0.97] transition-all"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      className="text-muted-foreground hover:text-destructive active:scale-[0.97] transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
