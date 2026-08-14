import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { sanitizeMermaidCode, makeSvgResponsive } from '../chat/CodeBlock';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontSize: 13,
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const renderChart = async () => {
      if (!containerRef.current) return;
      
      const sanitized = sanitizeMermaidCode(chart);
      try {
        setError(null);
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, sanitized);
        
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = makeSvgResponsive(svg);
        }
      } catch (err: any) {
        try {
          const fallbackSanitized = sanitized.replace(/\(([^)]+)\)/g, " - $1");
          const fallbackId = `mermaid-fb-${Math.random().toString(36).substring(2, 9)}`;
          const { svg: fallbackSvg } = await mermaid.render(fallbackId, fallbackSanitized);
          if (isMounted && containerRef.current) {
            containerRef.current.innerHTML = makeSvgResponsive(fallbackSvg);
          }
        } catch {
          if (isMounted) {
            setError(err.message || 'Failed to render Mermaid diagram');
          }
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md whitespace-pre-wrap font-mono text-xs">
        ⚠️ Diagram Parse Error: {error}
      </div>
    );
  }

  return (
    <div 
      className="flex justify-center items-center p-3 w-full h-full overflow-auto max-h-[480px] [&_svg]:max-w-full [&_svg]:max-h-[450px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:mx-auto" 
      ref={containerRef}
    />
  );
}
