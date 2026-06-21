export const geminiSpring = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

export const geminiSlowSpring = {
  type: "spring",
  stiffness: 200,
  damping: 30,
};

export const geminiFadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: geminiSpring,
};

export const geminiHoverScale = {
  scale: 1.02,
  transition: geminiSpring,
};

export const geminiTapScale = {
  scale: 0.98,
  transition: geminiSpring,
};
