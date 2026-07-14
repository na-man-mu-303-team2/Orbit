from __future__ import annotations

from typing import Any

from app.ai.composition_library import design_program_snapshot


from app.ai.deck_generation.models import (  # noqa: F401
    AgentOutput,
    AgentStatus,
    Audience,
    BackgroundPreference,
    BriefedBriefRef,
    CANVAS,
    Canvas,
    CanvasBackground,
    ColorFormality,
    ColorIntent,
    ColorLevel,
    ColorMood,
    DeckContentGenerationError as DeckContentGenerationError,
    DeckOutline,
    DensityTarget,
    DesignPlan,
    DesignConstraints,
    DesignOptions,
    DesignProfile,
    EvaluatorLensRef,
    FontOverride,
    ForbiddenStyle,
    FrozenBriefRef,
    GenerateDeckBrief,
    GenerateDeckCoachingContext,
    GenerateDeckDiagnostics,
    GenerateDeckMetadata,
    GenerateDeckReference,
    GenerateDeckReferenceKeyword,
    GenerateDeckRequest as GenerateDeckRequest,
    GenerateDeckResponse as GenerateDeckResponse,
    GeneratedContentItem,
    GeneratedDeckContentPlan,
    GeneratedSlideContent,
    GenericBriefRef,
    ImageReviewMode,
    InternalDesignProgramContext,
    LayoutDiversity,
    LayoutCompileResult,
    MediaIntent,
    MediaKind,
    MediaPolicy,
    NonEmptyString,
    PaletteOverride,
    PositiveInteger,
    PreferredHue,
    PresentationProfile,
    PresentationTimingPlan,
    Purpose,
    RawInput,
    ReferenceContext as ReferenceContext,
    ReferencePolicy,
    RepairReasonCode,
    SavedDesignPackSelection,
    SlideCountRange,
    SlidePlan,
    SlideTextOverlapReview,
    SlideType,
    SourceAuthority,
    SourceEvidence,
    SourceRecord,
    SourceType,
    SpeakerNotesRepairItem,
    SpeakerNotesRepairPlan,
    StylePromptContext,
    Template,
    TemplateSelectionItem,
    ThemeColor,
    Tone,
    ValidationIssue,
    ValidationResult as ValidationResult,
    VisualIntent,
    VisualPlanPolicy,
    VisualRhythm,
    WebResearchResult,
    WebSearchAliasPlan,
    WebSourceAssessment,
    WebSourceVettingResult,
)

from app.ai.deck_generation.source_grounding import (  # noqa: F401
    WEB_SEARCH_ALIAS_RESPONSE_FORMAT,
    WEB_SOURCE_VETTING_RESPONSE_FORMAT,
    canonicalize_web_url,
    default_source_refs,
    design_pack_source_ledgers,
    evidence_for,
    initial_source_records,
    is_http_url,
    object_field,
    plan_web_search_aliases,
    reference_keywords_for,
    research_web_sources,
    safe_token,
    unique_non_empty,
    validate_reference_policy_inputs,
    vet_web_sources,
    web_citation_claim_excerpt,
    web_research_query,
    web_search_diagnostic_urls,
    web_source_id,
    web_source_quality_satisfied,
    web_sources_from_response,
)

from app.ai.deck_generation.content_planning import (  # noqa: F401
    DECK_CONTENT_COUNT_REPAIR_INSTRUCTIONS,
    DECK_CONTENT_PLAN_CACHE,
    DECK_CONTENT_PLAN_CACHE_MAX,
    DECK_CONTENT_PLAN_CACHE_VERSION,
    DECK_CONTENT_REPAIR_INSTRUCTIONS,
    DECK_CONTENT_INSTRUCTIONS,
    DECK_CONTENT_RESPONSE_FORMAT,
    DESIGN_PACK_CONTENT_RESPONSE_FORMAT,
    DESIGN_PROMPT_HINT_RE,
    GENERIC_ACTION_TITLES,
    GENERAL_CLOSING_ACTION_PHRASES,
    EXECUTIVE_CLOSING_ACTION_PHRASES,
    PRESENTATION_PROFILE_BEATS,
    PRESENTATION_PROFILE_KEYWORDS,
    PRESENTATION_PROFILE_TIE_ORDER,
    SLIDE_TYPES,
    SLIDE_TYPE_SEQUENCE,
    SPEAKER_NOTES_REPAIR_INSTRUCTIONS,
    SPEAKER_NOTES_REPAIR_RESPONSE_FORMAT,
    action_title_requires_attention,
    allocate_weighted_integers,
    apply_timing_to_slide_plans,
    chars_per_minute_for_request,
    choose_slide_count,
    clear_deck_content_plan_cache,
    closing_title_for_profile,
    compact_dense_speaker_notes,
    compact_program_v2_content_items,
    content_item_capacity_for_slide,
    content_items_from_message,
    content_plan_repair_reasons,
    count_speaker_note_chars,
    deck_content_plan_cache_key,
    deck_content_response_format_for,
    deck_title_for_topic,
    deduplicate_speaker_notes_across_slides,
    design_pack_content_response_format,
    ensure_research_first_web_source_coverage,
    ensure_profile_closing_action,
    fit_grounded_speaker_note_candidates,
    grounded_source_attribution_candidates,
    grounded_speaker_note_transitions,
    has_any,
    keyword_phrase,
    keywords_for,
    merge_grounded_repair_notes,
    merge_keywords,
    message_duplicates_content_items,
    message_for,
    narrative_design_prompt,
    normalize_design_pack_slide_title,
    normalize_program_v2_action_titles,
    normalize_slide_type,
    normalize_structural_content_text,
    numeric_values,
    plan_presentation,
    plan_deck_content,
    plan_slides,
    presentation_profile_for_request,
    presentation_timing_plan_for_request,
    program_v2_action_title_candidate,
    remove_redundant_speaker_note_sentences,
    repair_content_plan_with_llm,
    repair_reason_codes,
    repair_short_speaker_notes_with_llm,
    repair_slide_count_with_llm,
    repeated_speaker_notes_slide_order,
    requires_llm_content,
    slide_plans_from_generated_content,
    slide_timing_weight,
    slide_type_for,
    speaker_note_character_similarity,
    speaker_note_fragments,
    speaker_note_repeats_prior,
    speaker_note_sentence,
    speaker_note_token_overlap,
    speaker_notes_for,
    speaker_notes_maximum_chars,
    speaker_notes_minimum_chars,
    split_content_and_design_prompt,
    structural_numeric_values,
    target_speaker_notes_chars_for_slide,
    title_for_slide,
    trim_speaker_notes_to_chars,
    unsupported_numeric_claim_reasons,
    uses_conversational_design_flow,
    uses_full_narrative_design_context,
    deck_content_prompt,
    generate_content_plan_with_llm,
    compact_design_prompt,
    has_profile_closing_action,
    presentation_rule_prompt,
)

from app.ai.deck_generation.design_planning import (  # noqa: F401
    DESIGN_LIBRARY_DIR,
    DOCUMENT_STYLE_PACK_IDS,
    EXPLICIT_COLOR_NAME_MAP,
    EXPLICIT_COLOR_RE,
    NEUTRAL_COLORS,
    PRESENTATION_DOCUMENT_STYLE_PACK_ID,
    PRESENTATION_DOCUMENT_STYLE_KEYWORDS,
    PRESENTATION_MODE_KEYWORDS,
    REPORT_MODE_KEYWORDS,
    SEMANTIC_PALETTE_PROFILES,
    SIMPLE_BASIC_STYLE_KEYWORDS,
    SIMPLE_BASIC_STYLE_PACK_ID,
    STYLE_PACK_LLM_PROMPTS,
    STYLE_PACK_PROMPT_REGISTRY,
    STYLE_PACK_REGISTRY,
    STYLE_PROFILE_REGISTRY,
    STRUCTURED_MEDIA_TERMS,
    SUBMISSION_DOCUMENT_STYLE_KEYWORDS,
    SUBMISSION_DOCUMENT_STYLE_PACK_ID,
    THEME_TOKEN_ANY_RE,
    THEME_TOKEN_RE,
    apply_design_options,
    apply_design_pack_media_plan,
    apply_explicit_palette,
    apply_font_override,
    apply_keyed_theme_tokens,
    apply_palette_override,
    apply_program_v2_design_tokens,
    apply_semantic_palette,
    apply_style_pack,
    art_director_context,
    color_role_distance,
    contrast_ratio,
    design_pack_forbidden_styles,
    design_pack_locks_dark_canvas,
    design_pack_media_score,
    design_pack_wants_white_canvas,
    design_profile_for,
    design_profile_for_visual_rhythm,
    direct_design,
    document_mode_for,
    effective_document_style_pack_id,
    explicit_palette_colors,
    is_neutral_color,
    is_structured_media_intent,
    keyed_theme_tokens,
    load_json_registry,
    load_text_registry,
    media_intent_for_policy,
    media_intent_needs_slot,
    palette_sources,
    plan_design,
    preset_style_prompt_for,
    program_v2_secondary_color,
    program_v2_slide_summary,
    registry_item,
    relative_luminance,
    resolve_style_prompt_context,
    select_style_pack,
    selected_style_pack_id,
    selected_style_pack_prompt,
    semantic_palette_for_sources,
    strip_theme_tokens,
    style_profile_for_text,
    text_color_for_background,
    theme_for_design_profile,
    uses_document_style_pack,
    wants_presentation_document_style,
    wants_simple_basic_style,
    wants_submission_document_style,
)

from app.ai.deck_generation.layout_compiler import (  # noqa: F401
    assemble_program_v2_slide,
    build_design_pack_content_manifest,
    cap_elements,
    compile_layout,
    core_geometry_fingerprint,
    design_pack_timing_plan,
    exclude_from_core_geometry,
    is_canvas_background_element,
    is_priority_element,
    is_required_element,
    program_v2_ai_notes,
    without_canvas_background_elements,
)
from app.ai.deck_generation.diagnostics import (
    generate_deck_diagnostics,
    generation_warnings,
    unique_warnings,
)
from app.ai.deck_generation.quality import (
    enforce_design_pack_constraints,
    finalize_python_quality,
    refine_python_quality,
    review_python_quality,
)
from app.ai.deck_generation.visual_requirements import (  # noqa: F401
    apply_visual_requirements,
    descriptive_media_prompt_part,
    plan_visual_requirements,
    program_v2_image_prompt,
    program_v2_visual_plan,
    program_v2_visual_type,
)




class DeckGenerationOrchestrator:
    def __init__(
        self,
        request: GenerateDeckRequest,
        *,
        client: Any | None = None,
        model: str | None = None,
        api_key: str | None = None,
        reference_context: list[ReferenceContext] | None = None,
        image_review_mode: ImageReviewMode = "auto",
    ) -> None:
        self.request = request
        self.client = client
        self.model = model
        self.api_key = api_key
        self.reference_context = reference_context
        self.image_review_mode = image_review_mode
        self.agent_outputs: dict[str, AgentOutput] = {}

    def run(self) -> GenerateDeckResponse:
        raw_input = self.run_brief_agent()
        raw_input = self.run_source_grounding_agent(raw_input)
        style_context = resolve_style_prompt_context(raw_input)
        outline, slide_plans = self.run_narrative_agent(raw_input, style_context)
        design_plan = self.run_design_director_agent(raw_input, slide_plans)
        template_selection: list[TemplateSelectionItem] = []
        layout_result = self.run_layout_agent(raw_input, design_plan)
        visual_requirements = plan_visual_requirements(
            raw_input,
            design_plan,
            layout_result,
        )
        layout_result = apply_visual_requirements(
            layout_result,
            visual_requirements,
        )
        deck = self.build_deck(raw_input, outline, design_plan, layout_result)
        deck = enforce_design_pack_constraints(deck, raw_input)
        self.run_chart_data_agent(deck)
        self.run_media_agent(deck)
        reviewer_validation = self.run_quality_reviewer_agent(deck)
        deck, validation = self.run_refiner_agent(deck, reviewer_validation)
        quality_result = finalize_python_quality(deck, raw_input)
        deck = quality_result.deck
        validation = quality_result.validation
        warnings = unique_warnings(
            [
                *generation_warnings(
                    raw_input,
                    len(layout_result.slides),
                    validation,
                ),
                *self.agent_warnings(),
            ]
        )
        return GenerateDeckResponse(
            deck=deck,
            templateSelection=template_selection,
            warnings=warnings,
            validation=validation,
            diagnostics=generate_deck_diagnostics(raw_input, deck, validation),
        )

    def record(
        self,
        name: str,
        summary: str,
        *,
        artifacts: dict[str, Any] | None = None,
        warnings: list[str] | None = None,
        next_actions: list[str] | None = None,
    ) -> None:
        self.agent_outputs[name] = AgentOutput(
            status="succeeded",
            summary=summary,
            artifacts=artifacts or {},
            warnings=warnings or [],
            nextActions=next_actions or [],
        )

    def agent_warnings(self) -> list[str]:
        return [
            warning
            for output in self.agent_outputs.values()
            for warning in output.warnings
        ]

    def run_brief_agent(self) -> RawInput:
        raw_input = analyze_input(self.request, reference_context=self.reference_context)
        self.record(
            "BriefAgent",
            "Normalized deck generation request.",
            artifacts={"rawInput": raw_input},
        )
        return raw_input

    def run_source_grounding_agent(self, raw_input: RawInput) -> RawInput:
        raw_input.source_records = initial_source_records(raw_input)
        validate_reference_policy_inputs(raw_input)
        research = research_web_sources(
            raw_input,
            client=self.client,
            model=self.model,
            api_key=self.api_key,
        )
        raw_input.research_attempts = research.attempts
        raw_input.relevant_web_source_count = research.relevant_source_count
        raw_input.official_web_source_count = research.official_source_count
        warnings: list[str] = []
        if research.status == "succeeded":
            raw_input.source_records.extend(research.sources)
        elif raw_input.brief.reference_policy == "research-first":
            raise DeckContentGenerationError(
                "WEB_RESEARCH_QUALITY_FAILED: "
                + (
                    research.message
                    or "관련성 있는 공식·독립 웹 출처를 확보하지 못했습니다."
                )
            )
        elif raw_input.brief.reference_policy == "references-first":
            warnings.append(
                "Web research was unavailable; generation continued with uploaded references."
            )
        self.record(
            "SourceGroundingAgent",
            "Prepared reference context for content grounding.",
            artifacts={
                "references": raw_input.references,
                "referenceContext": raw_input.reference_context,
                "sourceCount": len(raw_input.source_records),
                "webSourceCount": len(research.sources),
            },
            warnings=warnings,
        )
        return raw_input

    def run_narrative_agent(
        self,
        raw_input: RawInput,
        style_context: StylePromptContext,
    ) -> tuple[DeckOutline, list[SlidePlan]]:
        outline, slide_plans = plan_deck_content(
            raw_input,
            style_context,
            client=self.client,
            model=self.model,
            api_key=self.api_key,
        )
        self.record(
            "NarrativeAgent",
            "Planned slide narrative.",
            artifacts={"outline": outline, "slidePlans": slide_plans},
        )
        return outline, slide_plans

    def run_design_director_agent(
        self,
        raw_input: RawInput,
        slide_plans: list[SlidePlan],
    ) -> DesignPlan:
        design_plan = plan_design(
            raw_input,
            slide_plans,
            client=self.client,
            model=self.model,
            api_key=self.api_key,
        )
        self.record(
            "DesignDirectorAgent",
            "Selected theme and design direction.",
            artifacts={
                "theme": design_plan.theme,
                "slidePlans": design_plan.slide_plans,
                "designProgram": design_plan.design_program,
            },
        )
        return design_plan

    def run_layout_agent(
        self,
        raw_input: RawInput,
        design_plan: DesignPlan,
    ) -> LayoutCompileResult:
        layout_result = compile_layout(raw_input, design_plan)
        self.record(
            "LayoutAgent",
            "Composed editable slide elements.",
            artifacts={
                "slides": layout_result.slides,
                "uniqueCoreLayoutCount": len(
                    {
                        core_geometry_fingerprint(slide)
                        for slide in layout_result.slides[1:-1]
                    }
                ),
            },
        )
        return layout_result

    def run_chart_data_agent(self, deck: dict[str, Any]) -> None:
        empty_chart_count = sum(
            1
            for slide in deck["slides"]
            for element in slide["elements"]
            if element["type"] == "chart" and not element.get("props", {}).get("data")
        )
        warnings = (
            ["ChartDataAgent kept chart data empty because no source numbers were available."]
            if empty_chart_count
            else []
        )
        self.record(
            "ChartDataAgent",
            "Checked chart data provenance.",
            artifacts={"emptyChartCount": empty_chart_count},
            warnings=warnings,
        )

    def run_media_agent(self, deck: dict[str, Any]) -> None:
        image_count = sum(
            1
            for slide in deck["slides"]
            for element in slide["elements"]
            if element["type"] == "image"
        )
        self.record(
            "MediaAgent",
            "Checked media placeholders and provided images.",
            artifacts={"imageCount": image_count},
        )

    def run_quality_reviewer_agent(self, deck: dict[str, Any]) -> ValidationResult:
        quality_result = review_python_quality(deck)
        validation = quality_result.validation
        self.record(
            "QualityReviewerAgent",
            "Reviewed layout, content, design, and presentation quality.",
            artifacts={"validation": validation},
        )
        return validation

    def run_refiner_agent(
        self,
        deck: dict[str, Any],
        reviewer_validation: ValidationResult,
    ) -> tuple[dict[str, Any], ValidationResult]:
        quality_result = refine_python_quality(
            deck,
            reviewer_validation,
            client=self.client,
            model=self.model,
            api_key=self.api_key,
            image_review_mode=self.image_review_mode,
        )
        self.record(
            "RefinerAgent",
            "Applied bounded rule-based refinements.",
            artifacts={"validation": quality_result.validation},
        )
        return quality_result.deck, quality_result.validation

    def build_deck(
        self,
        raw_input: RawInput,
        outline: DeckOutline,
        design_plan: DesignPlan,
        layout_result: LayoutCompileResult,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "language": "ko",
            "locale": "ko-KR",
            "sourceType": "ai",
            "generatedBy": "ai",
            "audience": raw_input.metadata.audience,
            "purpose": raw_input.metadata.purpose,
            "tone": raw_input.metadata.tone,
            "createdFrom": {
                "topic": raw_input.topic,
                "references": [
                    {"fileId": reference.file_id}
                    for reference in raw_input.references
                ],
                "designReferences": [],
            },
        }
        metadata["presentationProfile"] = raw_input.presentation_profile
        metadata["designProgramSnapshot"] = design_program_snapshot(
            design_plan.design_program
        )

        return {
            "deckId": f"deck_ai_{safe_token(raw_input.project_id)}",
            "projectId": raw_input.project_id,
            "title": outline.title,
            "version": 1,
            "targetDurationMinutes": raw_input.target_duration_minutes,
            "metadata": metadata,
            "canvas": {
                "preset": "wide-16-9",
                "width": CANVAS.width,
                "height": CANVAS.height,
                "aspectRatio": "16:9",
            },
            "theme": design_plan.theme,
            "slides": layout_result.slides,
        }


def generate_deck(
    request: GenerateDeckRequest,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
    reference_context: list[ReferenceContext] | None = None,
    image_review_mode: ImageReviewMode = "auto",
) -> GenerateDeckResponse:
    return DeckGenerationOrchestrator(
        request,
        client=client,
        model=model,
        api_key=api_key,
        reference_context=reference_context,
        image_review_mode=image_review_mode,
    ).run()


def analyze_input(
    request: GenerateDeckRequest,
    *,
    reference_context: list[ReferenceContext] | None = None,
) -> RawInput:
    slide_count = choose_slide_count(
        request.target_duration_minutes,
        request.slide_count_range,
    )
    duration_seconds = request.target_duration_minutes * 60
    if slide_count > duration_seconds // 15:
        raise DeckContentGenerationError(
            "Slide count exceeds the minimum 15 seconds available per slide."
        )
    prompt, design_prompt = split_content_and_design_prompt(
        request.prompt,
        request.design_prompt,
    )
    resolved_reference_context = (
        reference_context if reference_context is not None else request.reference_context
    )
    reference_policy = (
        request.reference_policy
        or request.design.reference_policy
        or request.brief.reference_policy
    )
    brief = request.brief.model_copy(update={"reference_policy": reference_policy})
    references = request.references or [
        GenerateDeckReference(fileId=file_id) for file_id in request.reference_file_ids
    ]
    return RawInput(
        project_id=request.project_id,
        topic=request.topic.strip(),
        prompt=prompt,
        design_prompt=design_prompt,
        brief=brief,
        target_duration_minutes=request.target_duration_minutes,
        slide_count=slide_count,
        min_slide_count=request.slide_count_range.min,
        max_slide_count=request.slide_count_range.max,
        timingPlan=presentation_timing_plan_for_request(request, slide_count),
        template=request.template,
        metadata=request.metadata,
        design=request.design,
        visual_plan_policy=request.visual_plan_policy,
        reference_policy=reference_policy,
        reference_file_ids=request.reference_file_ids,
        references=references,
        reference_keywords=request.reference_keywords,
        reference_context=resolved_reference_context,
        design_program_context=request.design_program_context,
    ).model_copy(
        update={
            "presentation_profile": presentation_profile_for_request(request),
        }
    )
