import { describe, expect, it } from "vitest";

import {
  presentationCompanionAnnotationCommandSchema,
  presentationCompanionAnnotationSnapshotSchema,
  presentationCompanionEventSchema,
  presentationCompanionLaserSchema,
  presentationCompanionMaxIceCandidateLength,
  presentationCompanionMaxPointBatch,
  presentationCompanionMaxSdpLength,
  presentationCompanionPointSchema,
  presentationCompanionSignalSchema
} from "./websocket.schema";

const point = {
  x: 0.5,
  y: 0.25,
  pressure: 0.75,
  t: 16
};

const commandBase = {
  sessionId: "session_1",
  authorityEpochId: "epoch_1",
  surfaceId: "surface_1",
  clientOperationId: "operation_1",
  baseRevision: 4,
  sequence: 8
};

describe("presentation companion websocket contract", () => {
  it("accepts a 64-point batch and rejects the 65th point", () => {
    expect(
      presentationCompanionAnnotationCommandSchema.safeParse({
        ...commandBase,
        kind: "stroke-points",
        strokeId: "stroke_1",
        points: Array.from(
          { length: presentationCompanionMaxPointBatch },
          () => point
        )
      }).success
    ).toBe(true);
    expect(
      presentationCompanionAnnotationCommandSchema.safeParse({
        ...commandBase,
        kind: "stroke-points",
        strokeId: "stroke_1",
        points: Array.from(
          { length: presentationCompanionMaxPointBatch + 1 },
          () => point
        )
      }).success
    ).toBe(false);
  });

  it.each([
    { ...point, x: -0.001 },
    { ...point, y: 1.001 },
    { ...point, pressure: Number.NaN },
    { ...point, pressure: 1.1 },
    { ...point, t: 120_001 }
  ])("rejects an out-of-bound point %#", (candidate) => {
    expect(
      presentationCompanionPointSchema.safeParse(candidate).success
    ).toBe(false);
  });

  it("rejects surface snapshots over the total point limit", () => {
    const stroke = (index: number) => ({
      strokeId: `stroke_${index}`,
      tool: "pen",
      color: "ink-black",
      width: 0.01,
      points: Array.from({ length: 4_000 }, () => point)
    });
    expect(
      presentationCompanionAnnotationSnapshotSchema.safeParse({
        sessionId: "session_1",
        authorityEpochId: "epoch_1",
        surfaceId: "surface_1",
        surfaceRevision: 1,
        strokes: Array.from({ length: 13 }, (_, index) => stroke(index))
      }).success
    ).toBe(false);
  });

  it("rejects oversize SDP and ICE payloads", () => {
    const signalBase = {
      sessionId: "session_1",
      authorityEpochId: "epoch_1",
      targetGeneration: 1,
      signalId: "signal_1"
    };
    expect(
      presentationCompanionSignalSchema.safeParse({
        ...signalBase,
        kind: "offer",
        sdp: "s".repeat(presentationCompanionMaxSdpLength + 1)
      }).success
    ).toBe(false);
    expect(
      presentationCompanionSignalSchema.safeParse({
        ...signalBase,
        kind: "ice",
        candidate: "c".repeat(
          presentationCompanionMaxIceCandidateLength + 1
        ),
        sdpMid: null,
        sdpMLineIndex: null
      }).success
    ).toBe(false);
  });

  it("keeps laser payloads strict and normalized", () => {
    expect(
      presentationCompanionLaserSchema.safeParse({
        sessionId: "session_1",
        authorityEpochId: "epoch_1",
        surfaceId: "surface_1",
        sequence: 1,
        kind: "move",
        x: 0.2,
        y: 0.8,
        rawPointerEvent: "PRIVATE_POINTER"
      }).success
    ).toBe(false);
  });

  it("parses only a strict common envelope with a pseudonymous companion user", () => {
    const event = {
      type: "presentation:companion:joined",
      roomId: "presentation:session_1:companion:1",
      sessionId: "session_1",
      userId: "companion:companion_opaque_1",
      sentAt: "2026-07-23T00:00:00.000Z",
      payload: {
        pairingGeneration: 1,
        scopes: ["view-audience-output", "write-annotation"]
      }
    };
    expect(presentationCompanionEventSchema.parse(event)).toEqual(event);
    expect(
      presentationCompanionEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, speakerNotes: "PRIVATE_NOTES" }
      }).success
    ).toBe(false);
  });
});
