import app.ai.generate_deck as generate_deck_facade
from app.ai.deck_generation.models import (
    DeckContentGenerationError,
    GenerateDeckRequest,
    GenerateDeckResponse,
    ReferenceContext,
)
from app.ai.deck_generation.pipeline import generate_deck


def test_generate_deck_facade_has_stable_five_symbol_surface() -> None:
    assert generate_deck_facade.__all__ == [
        "DeckContentGenerationError",
        "GenerateDeckRequest",
        "GenerateDeckResponse",
        "ReferenceContext",
        "generate_deck",
    ]
    assert generate_deck_facade.DeckContentGenerationError is DeckContentGenerationError
    assert generate_deck_facade.GenerateDeckRequest is GenerateDeckRequest
    assert generate_deck_facade.GenerateDeckResponse is GenerateDeckResponse
    assert generate_deck_facade.ReferenceContext is ReferenceContext
    assert generate_deck_facade.generate_deck is generate_deck
    assert not hasattr(generate_deck_facade, "DeckGenerationOrchestrator")
    assert not hasattr(generate_deck_facade, "analyze_input")
