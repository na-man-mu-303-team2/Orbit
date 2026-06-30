import type { Deck, DeckPatch } from "@orbit/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "error";
export type PatchProducer = (deck: Deck) => DeckPatch;

type EditorPersistenceState = {
  workingDeckRef: MutableRefObject<Deck>;
  persistedBaseDeckRef: MutableRefObject<Deck | null>;
  lastAckedDeckRef: MutableRefObject<Deck | null>;
  saveQueueRef: MutableRefObject<Promise<void>>;
  pendingPatchInputsRef: MutableRefObject<(DeckPatch | PatchProducer)[]>;
  isSaveFlushInFlightRef: MutableRefObject<boolean>;
  hasHydratedPersistedBaseRef: MutableRefObject<boolean>;
  hasUnackedLocalChangesRef: MutableRefObject<boolean>;
  lastSavedAt: string | null;
  saveErrorMessage: string | null;
  saveState: SaveState;
  setLastSavedAt: Dispatch<SetStateAction<string | null>>;
  setSaveErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  markHydratedPersistedDeck: (
    nextDeck: Deck,
    setDeck: Dispatch<SetStateAction<Deck>>
  ) => void;
  applyAckedPersistedDeck: (nextDeck: Deck) => void;
  applyOptimisticWorkingDeck: (nextDeck: Deck) => void;
  replaceWorkingDeck: (nextDeck: Deck) => void;
  resetSaveState: () => void;
};

export function useEditorPersistenceState(initialDeck: Deck): EditorPersistenceState {
  const workingDeckRef = useRef(initialDeck);
  const persistedBaseDeckRef = useRef<Deck | null>(initialDeck);
  const lastAckedDeckRef = useRef<Deck | null>(initialDeck);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPatchInputsRef = useRef<(DeckPatch | PatchProducer)[]>([]);
  const isSaveFlushInFlightRef = useRef(false);
  const hasHydratedPersistedBaseRef = useRef(false);
  const hasUnackedLocalChangesRef = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  function markHydratedPersistedDeck(
    nextDeck: Deck,
    setDeck: Dispatch<SetStateAction<Deck>>
  ) {
    hasHydratedPersistedBaseRef.current = true;
    hasUnackedLocalChangesRef.current = false;
    workingDeckRef.current = nextDeck;
    persistedBaseDeckRef.current = nextDeck;
    lastAckedDeckRef.current = nextDeck;
    setDeck(nextDeck);
  }

  function applyAckedPersistedDeck(nextDeck: Deck) {
    workingDeckRef.current = nextDeck;
    persistedBaseDeckRef.current = nextDeck;
    lastAckedDeckRef.current = nextDeck;
    hasHydratedPersistedBaseRef.current = true;
    hasUnackedLocalChangesRef.current = false;
    pendingPatchInputsRef.current = [];
  }

  function applyOptimisticWorkingDeck(nextDeck: Deck) {
    workingDeckRef.current = nextDeck;
    hasUnackedLocalChangesRef.current = true;
  }

  function replaceWorkingDeck(nextDeck: Deck) {
    workingDeckRef.current = nextDeck;
  }

  function resetSaveState() {
    setSaveState("idle");
    setSaveErrorMessage(null);
  }

  return {
    workingDeckRef,
    persistedBaseDeckRef,
    lastAckedDeckRef,
    saveQueueRef,
    pendingPatchInputsRef,
    isSaveFlushInFlightRef,
    hasHydratedPersistedBaseRef,
    hasUnackedLocalChangesRef,
    lastSavedAt,
    saveErrorMessage,
    saveState,
    setLastSavedAt,
    setSaveErrorMessage,
    setSaveState,
    markHydratedPersistedDeck,
    applyAckedPersistedDeck,
    applyOptimisticWorkingDeck,
    replaceWorkingDeck,
    resetSaveState
  };
}
