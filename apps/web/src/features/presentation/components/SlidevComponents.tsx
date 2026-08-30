import React from 'react';

/**
 * Slidev <Arrow /> component
 * Draws an SVG arrow between coordinates or across a slide
 */
export interface ArrowProps {
  x1?: string | number;
  y1?: string | number;
  x2?: string | number;
  y2?: string | number;
  width?: string | number;
  color?: string;
  twoWay?: boolean;
  className?: string;
}

export const Arrow: React.FC<ArrowProps> = ({
  x1 = 10,
  y1 = 10,
  x2 = 100,
  y2 = 100,
  width = 2,
  color = '#ffffff',
  twoWay = false,
  className = '',
}) => {
  const nx1 = Number(x1);
  const ny1 = Number(y1);
  const nx2 = Number(x2);
  const ny2 = Number(y2);
  const nWidth = Number(width);

  const markerId = `arrowhead-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg className={`absolute inset-0 pointer-events-none w-full h-full ${className}`}>
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
        {twoWay && (
          <marker
            id={`${markerId}-start`}
            markerWidth="10"
            markerHeight="7"
            refX="0"
            refY="3.5"
            orient="auto-start-reverse"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
          </marker>
        )}
      </defs>
      <line
        x1={nx1}
        y1={ny1}
        x2={nx2}
        y2={ny2}
        stroke={color}
        strokeWidth={nWidth}
        markerEnd={`url(#${markerId})`}
        markerStart={twoWay ? `url(#${markerId}-start)` : undefined}
      />
    </svg>
  );
};

/**
 * Slidev <AutoFitText /> component
 * Responsive container that scales text size to fit available width/height
 */
export interface AutoFitTextProps {
  max?: number;
  min?: number;
  children?: React.ReactNode;
  modelValue?: string;
  className?: string;
}

export const AutoFitText: React.FC<AutoFitTextProps> = ({
  children,
  modelValue,
  className = '',
}) => {
  return (
    <div
      className={`w-full flex items-center justify-center font-bold tracking-tight text-center ${className}`}
    >
      <span className="text-2xl md:text-4xl lg:text-5xl leading-tight text-white">
        {modelValue || children}
      </span>
    </div>
  );
};

/**
 * Slidev <Toc /> Table of Contents component
 */
export interface TocProps {
  columns?: number;
  maxDepth?: number;
  list?: Array<{ title: string; index: number }>;
}

export const Toc: React.FC<TocProps> = ({ columns = 1, list = [] }) => {
  return (
    <div
      className={`grid gap-4 my-4 p-4 rounded-xl bg-[#121214] border border-white/10 ${
        columns > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
      }`}
    >
      {list.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-[#09090b] border border-white/5"
        >
          <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
            {item.index}
          </span>
          <span className="text-sm font-semibold text-zinc-200 truncate">{item.title}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Slidev <Youtube /> component
 */
export interface YoutubeProps {
  id: string;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Youtube: React.FC<YoutubeProps> = ({ id, className = '' }) => {
  return (
    <div
      className={`relative aspect-video rounded-xl overflow-hidden shadow-lg border border-[#1e293b] my-3 ${className}`}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  );
};

export default {
  Arrow,
  AutoFitText,
  Toc,
  Youtube,
};
