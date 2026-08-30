import React, { useRef, useState, useEffect } from 'react';
import { Trash2, Edit3, Circle } from 'lucide-react';

interface SlideDrawingCanvasProps {
  isActive: boolean;
  onClose?: () => void;
}

export const SlideDrawingCanvas: React.FC<SlideDrawingCanvasProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto flex flex-col">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        className="w-full h-full cursor-crosshair"
      />

      {/* Floating Mini Pen Palette */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0f1422]/90 border border-[#1e293b] backdrop-blur-md rounded-full px-4 py-1.5 flex items-center gap-3 shadow-xl z-50 select-none">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
          <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Pen</span>
        </div>

        {/* Color swatches */}
        <div className="flex items-center gap-1.5">
          {['#ef4444', '#f59e0b', '#10b981', '#38bdf8', '#a855f7', '#ffffff'].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-4 h-4 rounded-full transition-transform ${
                color === c ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        {/* Clear Button */}
        <button
          onClick={clearCanvas}
          className="p-1 rounded-lg text-muted-foreground hover:text-red-400 transition-colors"
          title="Clear Drawings"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
