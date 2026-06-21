import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Download, FileSpreadsheet, Presentation, Image, FileCode, Wand2, Plus, Copy, Check, X, Sparkles, ChevronRight, Type, Table, BarChart3
} from 'lucide-react';

interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  format: 'docx' | 'pptx' | 'xlsx' | 'pdf' | 'html';
  category: 'business' | 'academic' | 'creative' | 'technical';
}

const TEMPLATES: DocumentTemplate[] = [
  { id: 't-1', name: 'Project Report', description: 'Professional project report with executive summary, timeline, and budget', icon: 'FileText', format: 'docx', category: 'business' },
  { id: 't-2', name: 'Presentation Deck', description: '10-slide presentation with title, agenda, content, and conclusion slides', icon: 'Presentation', format: 'pptx', category: 'business' },
  { id: 't-3', name: 'Financial Analysis', description: 'Spreadsheet with P&L, cash flow, and balance sheet templates', icon: 'FileSpreadsheet', format: 'xlsx', category: 'business' },
  { id: 't-4', name: 'Research Paper', description: 'Academic paper with abstract, introduction, methodology, results, and references', icon: 'FileText', format: 'docx', category: 'academic' },
  { id: 't-5', name: 'Literature Review', description: 'Structured literature review with comparison table and gap analysis', icon: 'FileText', format: 'docx', category: 'academic' },
  { id: 't-6', name: 'Story Outline', description: 'Creative writing template with plot, characters, settings, and chapters', icon: 'Type', format: 'docx', category: 'creative' },
  { id: 't-7', name: 'Blog Post', description: 'SEO-optimized blog post with headings, meta description, and keywords', icon: 'Type', format: 'html', category: 'creative' },
  { id: 't-8', name: 'API Documentation', description: 'Technical API docs with endpoints, parameters, examples, and auth', icon: 'FileCode', format: 'docx', category: 'technical' },
  { id: 't-9', name: 'Data Dashboard', description: 'Interactive spreadsheet with charts, KPIs, and data validation', icon: 'BarChart3', format: 'xlsx', category: 'technical' },
  { id: 't-10', name: 'User Manual', description: 'Step-by-step user guide with screenshots, tips, and troubleshooting', icon: 'FileText', format: 'docx', category: 'technical' },
];

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business',
  academic: 'Academic',
  creative: 'Creative',
  technical: 'Technical',
};

const CATEGORY_COLORS: Record<string, string> = {
  business: 'bg-blue-500/10 text-blue-400',
  academic: 'bg-purple-500/10 text-purple-400',
  creative: 'bg-pink-500/10 text-pink-400',
  technical: 'bg-green-500/10 text-green-400',
};

export default function DocumentsView() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredTemplates = TEMPLATES.filter((t) => {
    const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const generateDocument = () => {
    if (!selectedTemplate || !prompt.trim()) return;
    setIsGenerating(true);
    setGeneratedDoc(null);
    setTimeout(() => {
      const docContent = generateMockContent(selectedTemplate, prompt);
      setGeneratedDoc(docContent);
      setIsGenerating(false);
    }, 2500);
  };

  const generateMockContent = (template: DocumentTemplate, userPrompt: string): string => {
    const formatLabels: Record<string, string> = { docx: 'Word Document', pptx: 'PowerPoint', xlsx: 'Excel Spreadsheet', pdf: 'PDF', html: 'HTML Document' };
    return `[${formatLabels[template.format] || 'Document'}] ${template.name}

Generated based on: "${userPrompt}"

=== ${template.name.toUpperCase()} ===

${template.description}

This document was generated using AI and can be exported to ${template.format.toUpperCase()} format.

CONTENT PREVIEW:
----------------

Executive Summary:
This document addresses the request: "${userPrompt}". The following sections provide detailed analysis, recommendations, and actionable insights.

1. Overview
   Based on the provided prompt, the key objectives are identified and structured into a comprehensive document.

2. Key Points
   - Point 1: Detailed analysis of the request
   - Point 2: Relevant data and research findings
   - Point 3: Recommendations and next steps
   - Point 4: Implementation strategy

3. Detailed Analysis
   The AI has processed the request and generated structured content suitable for ${template.format.toUpperCase()} export. In a real implementation, this would contain the full generated content.

4. Conclusion
   This document is ready for export. Click the Download button to get the actual file.

5. Next Steps
   - Review the generated content
   - Make any necessary edits
   - Export to desired format
   - Share with stakeholders

---
Generated by NYX Document Engine
Template: ${template.name}
Format: ${template.format.toUpperCase()}
Timestamp: ${new Date().toLocaleString()}`;
  };

  const copyToClipboard = () => {
    if (generatedDoc) {
      navigator.clipboard.writeText(generatedDoc);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={FileText} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Document Generation</h1>
              <p className="text-xs text-muted-foreground">Generate DOCX, PPTX, XLSX, PDF, and HTML documents</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Templates Panel */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="shrink-0 p-4 border-b border-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="shrink-0 p-3 border-b border-border flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                activeCategory === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  activeCategory === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTemplates.map((template) => {
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <div
                  key={template.id}
                  onClick={() => { setSelectedTemplate(template); setGeneratedDoc(null); }}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${CATEGORY_COLORS[template.category]}`}>
                      <AnimatedIcon icon={FileText} size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-medium text-foreground">{template.name}</h3>
                        <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] text-muted-foreground uppercase">
                          {template.format}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Generation Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTemplate ? (
            <>
              <div className="shrink-0 px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[selectedTemplate.category]}`}>
                    <AnimatedIcon icon={FileText} size={14} />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-foreground">{selectedTemplate.name}</h2>
                    <p className="text-[10px] text-muted-foreground">{selectedTemplate.description}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {!generatedDoc && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">What should the document contain?</label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={`e.g., "Create a project report for a mobile app launch including timeline, budget, and marketing strategy"`}
                        className="w-full h-32 px-4 py-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={generateDocument}
                          disabled={!prompt.trim() || isGenerating}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGenerating ? (
                            <>
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                              />
                              Generating...
                            </>
                          ) : (
                            <>
                              <AnimatedIcon icon={Wand2} size={14} /> Generate {selectedTemplate.format.toUpperCase()}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {generatedDoc && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AnimatedIcon icon={Check} size={14} className="text-green-500" />
                          <span className="text-sm font-medium text-foreground">Document Generated</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={copyToClipboard}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
                          >
                            {copied ? <AnimatedIcon icon={Check} size={12} className="text-green-500" /> : <AnimatedIcon icon={Copy} size={12} />}
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all">
                            <AnimatedIcon icon={Download} size={12} /> Download .{selectedTemplate.format}
                          </button>
                        </div>
                      </div>
                      <div className="p-4 bg-card border border-border rounded-xl">
                        <pre className="text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">{generatedDoc}</pre>
                      </div>
                      <button
                        onClick={() => { setGeneratedDoc(null); setPrompt(''); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-all"
                      >
                        ← Generate another document
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AnimatedIcon icon={FileText} size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a template</p>
                <p className="text-xs mt-1 opacity-60">Choose a document type and describe what you need</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
