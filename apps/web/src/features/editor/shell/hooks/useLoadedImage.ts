import { useEffect, useState } from "react";

export function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();

    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.src = src;

    if (nextImage.complete && nextImage.naturalWidth > 0) {
      setImage(nextImage);
    } else {
      setImage(null);
    }

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  return image;
}
