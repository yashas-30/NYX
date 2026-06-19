import { Toaster as Sonner, type ToasterProps, toast as originalToast } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = 'dark';

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export function formatErrorMessage(msg: string): string {
  if (!msg) return 'An unknown error occurred';
  const lines = msg
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return 'An unknown error occurred';

  let firstLine = lines[0];
  if (firstLine.length > 120) {
    firstLine = firstLine.substring(0, 117) + '...';
  }
  if (lines.length > 1) {
    firstLine += ' (see console for details)';
  }
  return firstLine;
}

export const toast = {
  error: (message: string | React.ReactNode, data?: any) => {
    if (typeof message === 'string') {
      const cleanMessage = formatErrorMessage(message);
      if (cleanMessage !== message) {
        console.error(`[NYX Error Details]:\n${message}`);
      }
      return originalToast.error(cleanMessage, data);
    }
    return originalToast.error(message, data);
  },
  success: originalToast.success,
  info: originalToast.info,
  warning: originalToast.warning,
  loading: originalToast.loading,
  custom: originalToast.custom,
  dismiss: originalToast.dismiss,
};

export { Toaster };
