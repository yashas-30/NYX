import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark', // We can sync this with theme provider later
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const renderChart = async () => {
      if (!containerRef.current) return;
      
      try {
        setError(null);
        // Generate a unique ID for the mermaid diagram
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to render Mermaid diagram');
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
      <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-md whitespace-pre-wrap font-mono text-sm">
        {error}
      </div>
    );
  }

  return (
    <div 
      className="flex justify-center items-center p-4 w-full h-full overflow-auto" 
      ref={containerRef}
    />
  );
}
