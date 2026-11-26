type IconProps = { size?: number };
const svg = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});
export const MicIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const MicOffIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>
);
export const CamIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10.5l5-3v9l-5-3" /></svg>
);
export const CamOffIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M3 3l18 18M7 6h6a3 3 0 0 1 3 3v3.5M16 10.5l5-3v9l-3.5-2.1M3 8v7a3 3 0 0 0 3 3h7" /></svg>
);
export const ShareIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><rect x="3" y="4" width="18" height="12" rx="2.5" /><path d="M12 13V8M9.5 10.5L12 8l2.5 2.5M8 20h8M12 16v4" /></svg>
);
export const CodeIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
);
export const ChatIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>
);
export const LeaveIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a11 11 0 0 0-7 0V15l-3 1.5z" /></svg>
);
