"use client";

import { useState } from "react";

type FallbackImageProps = {
  src?: string | null;
  fallbackSrc: string;
  alt: string;
  className?: string;
};

export function FallbackImage({ src, fallbackSrc, alt, className }: FallbackImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src?.trim() || fallbackSrc);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (currentSrc !== fallbackSrc) setCurrentSrc(fallbackSrc);
      }}
    />
  );
}
