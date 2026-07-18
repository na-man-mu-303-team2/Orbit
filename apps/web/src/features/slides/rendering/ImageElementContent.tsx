import type { ImageElementProps } from "@orbit/shared";
import {
  Group as KonvaGroup,
  Image as KonvaImageComponent,
  Rect as KonvaRect,
  Text as KonvaText
} from "react-konva";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import { resolveEditorAssetUrl } from "../../editor/shared/editorAssetUrl";
import { getImageElementLayout } from "./imageElementLayout";

type KonvaComponent = ComponentType<any>;

const Group = KonvaGroup as unknown as KonvaComponent;
const KonvaImage = KonvaImageComponent as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const Text = KonvaText as unknown as KonvaComponent;

export function ImageElementContent(props: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  imageProps: ImageElementProps;
}) {
  const { frame, imageProps } = props;
  const image = useLoadedImage(resolveEditorAssetUrl(imageProps.src));
  const layout =
    image && image.naturalWidth > 0 && image.naturalHeight > 0
      ? getImageElementLayout({
          crop: imageProps.crop,
          fit: imageProps.fit,
          focusX: imageProps.focusX,
          focusY: imageProps.focusY,
          frameHeight: frame.height,
          frameWidth: frame.width,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth
        })
      : null;

  return (
    <Group
      listening={false}
      clipX={0}
      clipY={0}
      clipWidth={frame.width}
      clipHeight={frame.height}
    >
      {image && layout ? null : (
        <Rect
          fill="#f8fafc"
          stroke="#93c5fd"
          strokeWidth={1}
          width={frame.width}
          height={frame.height}
        />
      )}
      {image && layout ? (
        <KonvaImage
          crop={layout.crop}
          image={image}
          x={layout.x}
          y={layout.y}
          width={layout.width}
          height={layout.height}
        />
      ) : (
        <Text
          align="center"
          fill="#475467"
          fontSize={14}
          fontStyle="bold"
          padding={16}
          text={`IMAGE\n${truncateValue(imageProps.alt || imageProps.src, 44)}`}
          verticalAlign="middle"
          width={frame.width}
          height={frame.height}
        />
      )}
    </Group>
  );
}

function useLoadedImage(src: string) {
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

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
