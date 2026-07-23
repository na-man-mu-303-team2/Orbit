from datetime import date

from app.ai.deck_generation.content_fact_quality import (
    apply_explicit_user_placements,
    as_validation_issues,
    expected_amount,
    sanitize_evidence_obligations,
    select_repair_slide_orders,
    validate_story_plan,
)
from app.ai.deck_generation.models import (
    CommunicationContract,
    ContentFactIssue,
    CriticalFact,
    EvidenceObligation,
    GenerateDeckRequest,
    GeneratedStoryPlan,
    GeneratedStorySlide,
)
from app.ai.deck_generation.pipeline import analyze_input
from app.ai.deck_generation.source_grounding import ground_sources


def raw_input():
    return ground_sources(
        analyze_input(
            GenerateDeckRequest(
                projectId="project_fact_qa",
                topic="PROJECT_COBALT_7421",
                prompt="운영 책임자와 보안 책임자의 공동 승인이 필요하며 예산은 37억 4천만 원이다.",
            )
        ),
        current_date=date(2026, 7, 18),
    ).raw_input


def test_korean_money_and_actor_relation_mismatches_are_advisory() -> None:
    raw = raw_input()
    source_id = raw.source_records[0].source_id
    amount = CriticalFact(
        factId="fact_amount",
        kind="amount",
        canonicalText="37억 4천만 원",
        sourceRefs=[source_id],
        value="37.4",
        unit="억원",
    )
    actors = CriticalFact(
        factId="fact_actors",
        kind="actor-relation",
        canonicalText="운영 책임자와 보안 책임자의 공동 승인",
        sourceRefs=[source_id],
        actors=["운영 책임자", "보안 책임자"],
        relation="승인",
        joint=True,
    )
    plan = GeneratedStoryPlan(
        title="검증",
        slides=[
            GeneratedStorySlide(
                title="예산과 승인",
                message="예산은 37억 원이며 운영 책임자, 보안 책임자, 제품 책임자가 공동 승인한다.",
                slideType="cover",
                sourceRefs=[source_id],
            )
        ],
        criticalFacts=[amount, actors],
    )

    issues = validate_story_plan(raw, plan)

    assert expected_amount(amount) == 3_740_000_000
    assert {issue.code for issue in issues} == {
        "FACT_AMOUNT_MISMATCH",
        "FACT_APPROVAL_RELATION_MISMATCH",
    }
    assert all(issue.priority == 2 for issue in issues)
    assert all(not issue.blocking for issue in as_validation_issues(issues))


def test_invalid_domain_evidence_is_removed_and_repairs_are_limited_to_three() -> None:
    raw = raw_input()
    source_id = raw.source_records[0].source_id
    valid = EvidenceObligation(
        obligationId="obligation_valid",
        canonicalText="공동 승인이 필요하다",
        evidenceText="공동 승인이 필요하며",
        sourceRefs=[source_id],
        reason="decision-critical",
        mustInclude=True,
    )
    invalid = EvidenceObligation(
        obligationId="obligation_invalid",
        canonicalText="출처에 없는 의료 금기",
        evidenceText="출처에 존재하지 않는 문장",
        sourceRefs=[source_id],
        reason="user-required",
        mustInclude=True,
    )

    obligations, invalid_issues = sanitize_evidence_obligations(
        raw,
        [valid, invalid],
    )
    ranked = select_repair_slide_orders(
        [
            ContentFactIssue(
                code="FACT_REQUIRED_MISSING",
                message="missing",
                slideOrder=order,
                priority=2,
            )
            for order in range(1, 6)
        ]
        + invalid_issues
    )

    assert obligations == [valid]
    assert [issue.code for issue in invalid_issues] == [
        "EVIDENCE_OBLIGATION_SOURCE_INVALID"
    ]
    assert ranked == [1, 2, 3]


def test_all_typed_fact_kinds_share_the_same_repair_priority() -> None:
    kinds = [
        "identifier",
        "product-name",
        "amount",
        "date",
        "actor-relation",
        "metric",
        "condition",
        "required-phrase",
    ]
    issues = [
        ContentFactIssue(
            code=f"FACT_{kind.upper()}",
            message=kind,
            slideOrder=index,
            priority=2,
        )
        for index, kind in enumerate(kinds, start=1)
    ]

    assert select_repair_slide_orders(issues) == [1, 2, 3]
    assert {issue.priority for issue in issues} == {2}


def test_explicit_cover_subtitle_placement_overrides_story_inference() -> None:
    raw = analyze_input(
        GenerateDeckRequest(
            projectId="project_cover_fact",
            topic="제품 소개",
            prompt="PROJECT_COBALT_7421을 표지 부제에 표시해줘.",
        )
    )
    plan = GeneratedStoryPlan(
        title="제품 소개",
        slides=[
            GeneratedStorySlide(
                title="제품 소개",
                message="핵심 제안",
                slideType="cover",
                sourceRefs=["topic:brief"],
            )
        ],
        communicationContract=CommunicationContract(),
    )

    updated = apply_explicit_user_placements(raw, plan)

    assert updated.critical_facts[0].canonical_text == "PROJECT_COBALT_7421"
    placement = updated.communication_contract.placement_constraints[0]
    assert placement.slide_role == "cover"
    assert placement.element_role == "subtitle"
