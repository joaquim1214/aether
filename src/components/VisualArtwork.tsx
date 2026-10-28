import React, { useState } from 'react';
import {
  BookOpen,
  Camera,
  Compass,
  Cpu,
  Film,
  Gamepad2,
  Keyboard,
  Monitor,
  Music,
  Sparkles,
  Tv,
} from 'lucide-react';

interface ArtworkProps {
  variant: string;
  accent?: 'mint' | 'lavender' | 'charcoal';
  className?: string;
  imageUrl?: string;
  alt?: string;
}

export const VisualArtwork: React.FC<ArtworkProps> = ({
  variant,
  accent = 'mint',
  className = 'w-full h-full',
  imageUrl,
  alt = 'Artwork',
}) => {
  const [imgError, setImgError] = useState(false);

  const bgClass =
    accent === 'mint'
      ? 'bg-mint-gradient text-[#141519]'
      : accent === 'lavender'
      ? 'bg-lavender-gradient text-[#141519]'
      : 'bg-[#141519] text-white';

  if (imageUrl && !imgError) {
    return (
      <div
        className={`relative overflow-hidden flex items-center justify-center select-none ${bgClass} ${className}`}
      >
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center select-none ${bgClass} ${className}`}
    >
      {/* Subtle geometric vector backdrop */}
      <svg
        viewBox="0 0 160 160"
        fill="none"
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
      >
        <circle
          cx="128"
          cy="32"
          r="54"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <circle
          cx="32"
          cy="132"
          r="46"
          fill="currentColor"
          fillOpacity="0.08"
        />
        <path
          d="M0 115 Q80 85 160 125"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1.5"
        />
      </svg>

      {/* Main focal emblem */}
      <div className="relative z-10 w-11 h-11 rounded-[14px] bg-white/85 backdrop-blur-sm text-[#141519] flex items-center justify-center shadow-xs">
        {variant === 'cyberpunk' && <Tv className="w-5 h-5" />}
        {variant === 'rpg' && <Gamepad2 className="w-5 h-5" />}
        {variant === 'cinema' && <Film className="w-5 h-5" />}
        {variant === 'frieren' && <Sparkles className="w-5 h-5" />}
        {variant === 'book' && <BookOpen className="w-5 h-5" />}
        {variant === 'synth' && <Music className="w-5 h-5" />}
        {variant === 'keyboard' && <Keyboard className="w-5 h-5" />}
        {variant === 'display' && <Monitor className="w-5 h-5" />}
        {variant === 'japan' && <Compass className="w-5 h-5" />}
        {variant === 'chair' && <Cpu className="w-5 h-5" />}
        {variant === 'camera' && <Camera className="w-5 h-5" />}
      </div>
    </div>
  );
};
