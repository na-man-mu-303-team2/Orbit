import { createDemoDeck } from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  resolveEditorAddElementCapabilities,
  resolveGroupCreationCapability,
  resolveProposedElementAddCapability
} from "./useEditorCanvasCommands";

describe("resolveProposedElementAddCapability", () => {
  it("classifies proposed imported-deck additions as authored targets", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    deck.slides[0]!.ooxmlOrigin = "imported";
    const text = deck.slides[0]!.elements.find(
      (element) => element.type === "text"
    );
    expect(text).toBeDefined();

    expect(
      resolveProposedElementAddCapability(deck, deck.slides[0]!, text!)
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
  });

  it("fails closed when an imported deck target slide has no provenance", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    const text = deck.slides[0]!.elements.find(
      (element) => element.type === "text"
    )!;

    expect(
      resolveProposedElementAddCapability(deck, deck.slides[0]!, text)
    ).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_PROVENANCE_MISSING"
    });
  });

  it("rejects proposed elements that the authored serializer cannot preserve", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    deck.slides[0]!.ooxmlOrigin = "imported";
    const chart: DeckElement = {
      elementId: "el_capability_chart",
      type: "chart",
      x: 0,
      y: 0,
      width: 400,
      height: 240,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      locked: false,
      visible: true,
      props: {
        type: "bar",
        title: "Chart",
        data: [{ label: "A", value: 1 }],
        style: {
          colors: ["#2563eb"],
          backgroundColor: "#ffffff",
          textColor: "#111827",
          fontFamily: "Pretendard",
          titleFontSize: 20,
          axisLabelFontSize: 12,
          legendFontSize: 12,
          dataLabelFontSize: 12,
          showLegend: false,
          legendPosition: "bottom",
          showDataLabels: false,
          showGrid: false,
          xAxisTitle: "",
          yAxisTitle: "",
          unit: ""
        }
      }
    };

    expect(
      resolveProposedElementAddCapability(deck, deck.slides[0]!, chart)
    ).toMatchObject({
      enabled: false,
      reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED"
    });
  });

  it("preflights every toolbar add action using the element that action creates", () => {
    const deck = createDemoDeck();
    const generic = resolveEditorAddElementCapabilities(deck, deck.slides[0]!);

    expect(generic.text.enabled).toBe(true);
    expect(generic.chart.enabled).toBe(true);
    expect(generic.shapes.rect.enabled).toBe(true);
    expect(generic.shapes.ellipse.enabled).toBe(true);
    expect(generic.shapes.triangle.enabled).toBe(false);
    expect(generic.shapes.customShape.enabled).toBe(false);

    deck.metadata.sourceType = "import";
    deck.slides[0]!.ooxmlOrigin = "imported";
    const imported = resolveEditorAddElementCapabilities(deck, deck.slides[0]!);
    expect(imported.text.enabled).toBe(true);
    expect(imported.chart.enabled).toBe(false);
    expect(
      Object.values(imported.shapes).every((entry) => !entry.enabled)
    ).toBe(true);
  });

  it("preflights the exact group element before enabling grouping", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;

    expect(
      resolveGroupCreationCapability(deck, slide, slide.elements.slice(0, 2))
    ).toMatchObject({
      enabled: false,
      reasonCode: "GENERIC_EXPORT_UNSUPPORTED"
    });
  });
});
