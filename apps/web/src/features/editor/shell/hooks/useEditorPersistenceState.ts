import type { Deck, DeckPatch } from "@orbit/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "error";
export type PatchProducer = (deck: Deck) => DeckPatch;

type EditorPersistenceState = {
  deckRef: MutableRefObject<Deck>;
  persistedDeckRef: MutableRefObject<Deck | null>;
  saveQueueRef: MutableRefObject<Promise<void>>;
  pendingSaveInputsRef: MutableRefObject<(DeckPatch | PatchProducer)[]>;
  isSaveFlushInFlightRef: MutableRefObject<boolean>;
  hasHydratedPersistedDeckRef: MutableRefObject<boolean>;
  hasLocalOptimisticChangesRef: MutableRefObject<boolean>;
  lastSavedAt: string | null;
  saveErrorMessage: string | null;
  saveState: SaveState;
  setLastSavedAt: Dispatch<SetStateAction<string | null>>;
  setSaveErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  applyPersistedDeckState: (nextDeck: Deck) => void;
  markHydratedDeck: (nextDeck: Deck, setDeck: Dispatch<SetStateAction<Deck>>) => void;
  resetSaveState: () => void;
};

export function useEditorPersistenceState(initialDeck: Deck): EditorPersistenceState {
  const deckRef = useRef(initialDeck);
  const persistedDeckRef = useRef<Deck | null>(initialDeck);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveInputsRef = useRef<(DeckPatch | PatchProducer)[]>([]);
  const isSaveFlushInFlightRef = useRef(false);
  const hasHydratedPersistedDeckRef = useRef(false);
  const hasLocalOptimisticChangesRef = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  function markHydratedDeck(nextDeck: Deck, setDeck: Dispatch<SetStateAction<Deck>>) {
    hasHydratedPersistedDeckRef.current = true;
    hasLocalOptimisticChangesRef.current = false;
    deckRef.current = nextDeck;
    persistedDeckRef.current = nextDeck;
    setDeck(nextDeck);
  }

  function applyPersistedDeckState(nextDeck: Deck) {
    deckRef.current = nextDeck;
    persistedDeckRef.current = nextDeck;
    hasHydratedPersistedDeckRef.current = true;
    hasLocalOptimisticChangesRef.current = false;
  }

  function resetSaveState() {
    setSaveState("idle");
    setSaveErrorMessage(null);
  }

  return {
    deckRef,
    persistedDeckRef,
    saveQueueRef,
    pendingSaveInputsRef,
    isSaveFlushInFlightRef,
    hasHydratedPersistedDeckRef,
    hasLocalOptimisticChangesRef,
    lastSavedAt,
    saveErrorMessage,
    saveState,
    setLastSavedAt,
    setSaveErrorMessage,
    setSaveState,
    applyPersistedDeckState: (nextDeck) => {
      applyPersistedDeckState(nextDeck);
    },
    markHydratedDeck: (nextDeck, setDeck) => {
      markHydratedDeck(nextDeck, setDeck);
    },
    resetSaveState
  };
}
