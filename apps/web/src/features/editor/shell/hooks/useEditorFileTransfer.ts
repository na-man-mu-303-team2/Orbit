import {
  createAddElementPatch,
  createElementId,
  createUpdateElementPropsPatch
} from "../../../../../../../packages/editor-core/src/index";
import type {
  Deck,
  DeckExportRequest,
  DeckPatch,
  DesignImageGenerationResult
} from "@orbit/shared";
import type { ChangeEvent, MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { createProject, fetchProjects, uploadProjectAsset } from "../../../projects/ProjectAssetWorkspace";
import { normalizeEditorAssetUrl } from "../../shared/editorAssetUrl";
import { exportDeck as requestDeckExport, importPptxIntoEditor } from "../api/editorJobApi";
import type { PptxImportState } from "../components/PptxImportQualityPanel";
import type { PatchProducer } from "./useEditorPersistenceState";
import {
  defaultImageInsertFrame,
  getDefaultImageInsertFrame,
  getNextElementZIndex
} from "../utils/editorLayout";
import {
  getEditorImageValidationMessage,
  getPptxImportValidationMessage,
  readImageNaturalSize,
  toEditorErrorMessage
} from "../utils/editorFileValidation";
import { createSlideScopedUploadFile } from "../utils/slideRenderUtils";
import { canEditSlideCanvas } from "../utils/slideEditingPolicy";

export type ImageUploadTarget =
  | { type: "insert"; slideId: string }
  | { elementId: string; slideId: string; type: "replace" };

type CommitPatch = (
  patch: DeckPatch | PatchProducer,
  baseDeck?: Deck
) => boolean;

const editorUploadProjectTitle = "ORBIT Editor Uploads";

export function useEditorFileTransfer(args: {
  commitPatch: CommitPatch;
  onClearSelectedKeyword: () => void;
  onCloseContextMenu: () => void;
  onImportedDeck: (deck: Deck) => void;
  onResetEditing: () => void;
  onSelectElement: (elementId: string) => void;
  onSelectSlide: (index: number) => void;
  onSetSelectTool: () => void;
  persistedProjectId?: string;
  prepareForImport: () => Promise<void>;
  projectId: string;
  refetchDeck: () => Promise<Deck | undefined>;
  workingDeckRef: MutableRefObject<Deck>;
}) {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pptxFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageUploadTargetRef = useRef<ImageUploadTarget | null>(null);
  const resolvedUploadProjectIdRef = useRef<string | null>(null);
  const [isImageUploadPending, setIsImageUploadPending] = useState(false);
  const [isPptxExporting, setIsPptxExporting] = useState(false);
  const [pptxExportStatus, setPptxExportStatus] = useState("");
  const [pptxExportError, setPptxExportError] = useState("");
  const [pptxImportState, setPptxImportState] = useState<PptxImportState>({
    status: "idle",
    warnings: [],
    qualityReport: null,
    message: ""
  });

  useEffect(() => {
    if (args.persistedProjectId) {
      resolvedUploadProjectIdRef.current = args.persistedProjectId;
    }
  }, [args.persistedProjectId]);

  function openImageFilePicker(target: ImageUploadTarget) {
    if (isImageUploadPending) return;
    const targetSlide = args.workingDeckRef.current.slides.find(
      (slide) => slide.slideId === target.slideId
    );
    if (!canEditSlideCanvas(targetSlide)) return;
    args.onCloseContextMenu();
    imageUploadTargetRef.current = target;
    imageFileInputRef.current?.click();
  }

  function openPptxFilePicker() {
    if (pptxImportState.status === "uploading" || pptxImportState.status === "importing") {
      return;
    }
    pptxFileInputRef.current?.click();
  }

  async function resolveUploadProject(targetProjectId: string) {
    if (resolvedUploadProjectIdRef.current) return resolvedUploadProjectIdRef.current;
    if (args.persistedProjectId) {
      resolvedUploadProjectIdRef.current = args.persistedProjectId;
      return args.persistedProjectId;
    }
    const projects = await fetchProjects();
    const preferredProject = projects.find((project) => project.projectId === targetProjectId);
    const project = preferredProject ?? projects[0] ?? (await createProject(editorUploadProjectTitle));
    resolvedUploadProjectIdRef.current = project.projectId;
    return project.projectId;
  }

  async function handleImageFileSelection(file: File, target: ImageUploadTarget) {
    if (getEditorImageValidationMessage(file)) return;
    setIsImageUploadPending(true);
    try {
      const activeDeck = args.workingDeckRef.current;
      const targetSlideIndex = activeDeck.slides.findIndex((slide) => slide.slideId === target.slideId);
      if (targetSlideIndex < 0) throw new Error("이미지를 넣을 슬라이드를 찾지 못했습니다.");

      const targetSlide = activeDeck.slides[targetSlideIndex];
      if (!canEditSlideCanvas(targetSlide)) {
        throw new Error("특수 장표에는 이미지를 추가하거나 교체할 수 없습니다.");
      }
      const uploadProjectId = await resolveUploadProject(activeDeck.projectId);
      const uploaded = await uploadProjectAsset(
        uploadProjectId,
        createSlideScopedUploadFile(file, targetSlide.order || targetSlideIndex + 1, "image"),
        "reference-material"
      );
      const normalizedUploadedUrl = normalizeEditorAssetUrl(uploaded.url);

      if (target.type === "replace") {
        const targetElement = targetSlide.elements.find((element) => element.elementId === target.elementId);
        if (!targetElement || targetElement.type !== "image") {
          throw new Error("교체할 이미지 요소를 찾지 못했습니다.");
        }
        args.commitPatch(
          (currentDeck) => createUpdateElementPropsPatch(
            currentDeck,
            target.slideId,
            target.elementId,
            { alt: file.name, src: normalizedUploadedUrl }
          ),
          activeDeck
        );
        args.onSelectSlide(targetSlideIndex);
        args.onSelectElement(target.elementId);
      } else {
        const elementId = createElementId(activeDeck);
        const naturalSize = await readImageNaturalSize(file).catch(() => ({
          height: defaultImageInsertFrame.height,
          width: defaultImageInsertFrame.width
        }));
        const frame = getDefaultImageInsertFrame(activeDeck.canvas, naturalSize);
        args.commitPatch(
          (currentDeck) => createAddElementPatch(currentDeck, target.slideId, {
            elementId,
            type: "image",
            role: "media",
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            rotation: 0,
            opacity: 1,
            zIndex: getNextElementZIndex(targetSlide.elements),
            locked: false,
            visible: true,
            props: {
              alt: file.name,
              fit: "contain",
              focusX: 0.5,
              focusY: 0.5,
              src: normalizedUploadedUrl
            }
          }),
          activeDeck
        );
        args.onSelectSlide(targetSlideIndex);
        args.onSelectElement(elementId);
        args.onResetEditing();
        args.onSetSelectTool();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsImageUploadPending(false);
    }
  }

  function insertGeneratedImage(
    result: DesignImageGenerationResult,
    slideId: string
  ) {
    const activeDeck = args.workingDeckRef.current;
    const targetSlideIndex = activeDeck.slides.findIndex(
      (slide) => slide.slideId === slideId
    );
    if (targetSlideIndex < 0) return false;
    const targetSlide = activeDeck.slides[targetSlideIndex];
    if (!canEditSlideCanvas(targetSlide)) return false;

    const elementId = createElementId(activeDeck);
    const frame = getDefaultImageInsertFrame(activeDeck.canvas, {
      width: result.width,
      height: result.height
    });
    args.commitPatch(
      (currentDeck) => createAddElementPatch(currentDeck, slideId, {
        elementId,
        type: "image",
        role: "media",
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        rotation: 0,
        opacity: 1,
        zIndex: getNextElementZIndex(targetSlide.elements),
        locked: false,
        visible: true,
        props: {
          alt: result.prompt,
          fit: "cover",
          focusX: 0.5,
          focusY: 0.5,
          src: normalizeEditorAssetUrl(result.url)
        }
      }),
      activeDeck
    );
    args.onSelectSlide(targetSlideIndex);
    args.onSelectElement(elementId);
    args.onResetEditing();
    args.onSetSelectTool();
    return true;
  }

  async function handlePptxFileSelection(file: File) {
    const validationMessage = getPptxImportValidationMessage(file);
    if (validationMessage) {
      setPptxImportState({ status: "error", warnings: [], qualityReport: null, message: validationMessage });
      return;
    }
    setPptxImportState({ status: "uploading", warnings: [], qualityReport: null, message: "PPTX 업로드 중..." });
    try {
      await args.prepareForImport();
      const activeProjectId = await resolveUploadProject(
        args.workingDeckRef.current.projectId || args.projectId
      );
      const { importResult, importedDeck } = await importPptxIntoEditor(activeProjectId, file, {
        onPhase: (phase) => setPptxImportState({
          status: phase,
          warnings: [],
          qualityReport: null,
          message: phase === "uploading" ? "PPTX 업로드 중..." : "PPTX 변환 중..."
        }),
        refetchDeck: args.refetchDeck
      });
      args.onImportedDeck(importedDeck);
      args.onClearSelectedKeyword();
      setPptxImportState({
        status: "succeeded",
        warnings: importResult.warnings,
        qualityReport: importResult.qualityReport,
        message: "PPTX 가져오기 완료"
      });
    } catch (error) {
      setPptxImportState({
        status: "error",
        warnings: [],
        qualityReport: null,
        message: toEditorErrorMessage(error)
      });
    }
  }

  async function exportDeck(
    save: () => Promise<boolean | undefined>,
    input: DeckExportRequest
  ): Promise<boolean> {
    if (isPptxExporting) return false;
    const activeProjectId = args.workingDeckRef.current.projectId || args.persistedProjectId;
    if (!activeProjectId) {
      setPptxExportError("내보낼 프로젝트를 찾지 못했습니다.");
      return false;
    }
    setIsPptxExporting(true);
    setPptxExportError("");
    setPptxExportStatus("저장 중...");
    try {
      const saved = await save();
      if (!saved) throw new Error("최신 편집 내용을 저장한 뒤 다시 시도하세요.");
      const formatLabel = input.format === "png" ? "PNG ZIP" : "PPTX";
      setPptxExportStatus(`${formatLabel} 내보내기 중...`);
      const result = await requestDeckExport(activeProjectId, input);
      setPptxExportStatus(
        result.warnings.length
          ? `${formatLabel} 생성 완료, ${result.warnings.length}개 경고`
          : `${formatLabel} 생성 완료`
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
      return true;
    } catch (error) {
      setPptxExportStatus("");
      setPptxExportError(
        error instanceof Error ? error.message : "Deck 내보내기에 실패했습니다."
      );
      return false;
    } finally {
      setIsPptxExporting(false);
    }
  }

  function handleImageFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? []);
    const target = imageUploadTargetRef.current;
    event.target.value = "";
    imageUploadTargetRef.current = null;
    if (file && target) void handleImageFileSelection(file, target);
  }

  function handlePptxFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (file) void handlePptxFileSelection(file);
  }

  return {
    actions: {
      handleImageFileInputChange,
      handlePptxFileInputChange,
      exportDeck,
      insertGeneratedImage,
      openImageFilePicker,
      openPptxFilePicker
    },
    refs: { imageFileInputRef, pptxFileInputRef },
    state: {
      isImageUploadPending,
      isPptxExporting,
      pptxExportError,
      pptxExportStatus,
      pptxImportState
    }
  };
}
