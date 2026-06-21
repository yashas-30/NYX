import React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '@src/shared/utils';

interface AnimatedIconProps extends Omit<LucideProps, 'ref'> {
  icon: LucideIcon | React.ComponentType<any>;
  animationType?: 'scale' | 'spin' | 'bounce' | 'pulse';
  containerClassName?: string;
  disableAnimation?: boolean;
}

export const AnimatedIcon = React.forwardRef<HTMLDivElement, AnimatedIconProps>(({ 
  icon: Icon, 
  animationType = 'scale', 
  className, 
  containerClassName,
  disableAnimation = false,
  ...props 
}, ref) => {
  if (disableAnimation) {
    return (
      <div className={cn("inline-flex items-center justify-center shrink-0", containerClassName)} ref={ref}>
        <Icon className={className} {...props} />
      </div>
    );
  }

  const animations: Record<string, MotionProps> = {
    scale: { whileHover: { scale: 1.15 }, whileTap: { scale: 0.9 } },
    spin: { whileHover: { rotate: 180 }, whileTap: { scale: 0.9 } },
    bounce: { whileHover: { y: -3 }, whileTap: { scale: 0.9 } },
    pulse: { whileHover: { scale: 1.1, opacity: 0.8 }, whileTap: { scale: 0.9 } }
  };

  const selectedAnimation = animations[animationType] || animations.scale;

  return (
    <motion.div 
      ref={ref}
      {...selectedAnimation}
      className={cn("inline-flex items-center justify-center shrink-0 origin-center", containerClassName)}
    >
      <Icon className={className} {...props} />
    </motion.div>
  );
});

AnimatedIcon.displayName = 'AnimatedIcon';
