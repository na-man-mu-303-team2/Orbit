import {
  semanticCueRuntimeConfig,
  type SemanticCueRuntimeConfig
} from "../semanticCueRuntimeConfig";
import {
  defaultSemanticCueCombinerConfig,
  type SemanticCueCombinerConfig
} from "../semanticCueScoreCombiner";

type ConfigFieldDescriptor = {
  path: string[];
  label: string;
  step?: number;
};

const runtimeConfigFields: ConfigFieldDescriptor[] = [
  { path: ["candidateWeights", "lexical"], label: "가중치: lexical" },
  { path: ["candidateWeights", "conceptCoverage"], label: "가중치: concept" },
  { path: ["candidateWeights", "retrieval"], label: "가중치: retrieval" },
  { path: ["candidateWeights", "importance"], label: "가중치: importance" },
  { path: ["candidateEligibility", "lexical"], label: "후보 자격: lexical ≥" },
  { path: ["candidateEligibility", "retrieval"], label: "후보 자격: retrieval ≥" },
  { path: ["maxCandidates"], label: "최대 후보 수", step: 1 },
  { path: ["maxNliCandidates"], label: "최대 NLI 후보 수", step: 1 },
  { path: ["maxHypothesesPerCue"], label: "큐당 최대 가설 수", step: 1 },
  { path: ["maxNliTokens"], label: "NLI premise 최대 토큰", step: 8 },
  { path: ["nliTimeoutMs"], label: "NLI 타임아웃(ms)", step: 100 },
  { path: ["nliThrottleMs"], label: "NLI 스로틀(ms)", step: 100 },
  { path: ["basicCoveredRetrieval"], label: "basic covered: retrieval ≥" },
  { path: ["basicPartialScore"], label: "basic partial: score ≥" },
  { path: ["basicPartialConceptCoverage"], label: "basic partial: concept ≥" }
];

const combinerConfigFields: ConfigFieldDescriptor[] = [
  { path: ["weights", "lexical"], label: "결합 가중치: lexical" },
  { path: ["weights", "conceptCoverage"], label: "결합 가중치: concept" },
  { path: ["weights", "embedding"], label: "결합 가중치: embedding" },
  { path: ["weights", "entailment"], label: "결합 가중치: entailment" },
  { path: ["contradictionThreshold"], label: "contradicted: contra ≥" },
  { path: ["coveredFinalScore"], label: "covered: final ≥" },
  { path: ["coveredEntailment"], label: "covered: entail ≥" },
  { path: ["partialFinalScore"], label: "partial: final ≥" },
  { path: ["entailmentFloorThreshold"], label: "entail 바닥 보정 발동 ≥" },
  { path: ["entailmentFloorScore"], label: "entail 바닥 보정 최소 final" },
  { path: ["entailmentReasonThreshold"], label: "사유 코드: entail ≥" },
  { path: ["conceptReasonThreshold"], label: "사유 코드: concept ≥" },
  { path: ["lexicalReasonThreshold"], label: "사유 코드: lexical ≥" },
  { path: ["embeddingReasonThreshold"], label: "사유 코드: embedding ≥" }
];

export function LabConfigPanel(props: {
  runtimeConfig: SemanticCueRuntimeConfig;
  combinerConfig: SemanticCueCombinerConfig;
  onRuntimeConfigChange: (config: SemanticCueRuntimeConfig) => void;
  onCombinerConfigChange: (config: SemanticCueCombinerConfig) => void;
  defaultOpen?: boolean;
}) {
  return (
    <details className="lab-config" open={props.defaultOpen ?? true}>
      <summary>
        <h2>파라미터 튜닝</h2>
      </summary>
      <div className="lab-row">
        <button
          type="button"
          onClick={() => {
            props.onRuntimeConfigChange(structuredClone(semanticCueRuntimeConfig));
            props.onCombinerConfigChange(
              structuredClone(defaultSemanticCueCombinerConfig)
            );
          }}
        >
          프로덕션 기본값으로 리셋
        </button>
      </div>
      <h3>후보 선택 / basic 판정</h3>
      <div className="lab-field-grid">
        {runtimeConfigFields.map((field) => (
          <LabNumberField
            key={field.path.join(".")}
            descriptor={field}
            value={readPath(props.runtimeConfig, field.path)}
            defaultValue={readPath(semanticCueRuntimeConfig, field.path)}
            onChange={(value) =>
              props.onRuntimeConfigChange(
                writePath(props.runtimeConfig, field.path, value)
              )
            }
          />
        ))}
      </div>
      <h3>점수 결합기 (NLI 이후)</h3>
      <div className="lab-field-grid">
        {combinerConfigFields.map((field) => (
          <LabNumberField
            key={field.path.join(".")}
            descriptor={field}
            value={readPath(props.combinerConfig, field.path)}
            defaultValue={readPath(defaultSemanticCueCombinerConfig, field.path)}
            onChange={(value) =>
              props.onCombinerConfigChange(
                writePath(props.combinerConfig, field.path, value)
              )
            }
          />
        ))}
      </div>
    </details>
  );
}

function LabNumberField(props: {
  descriptor: ConfigFieldDescriptor;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  const changed = props.value !== props.defaultValue;
  return (
    <label className={changed ? "lab-field lab-field-changed" : "lab-field"}>
      {props.descriptor.label}
      {changed && <span className="lab-changed-mark"> ✱</span>}
      <input
        type="number"
        step={props.descriptor.step ?? 0.01}
        value={props.value}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) {
            props.onChange(value);
          }
        }}
      />
    </label>
  );
}

function readPath(target: unknown, path: string[]): number {
  let current: unknown = target;
  for (const key of path) {
    current = (current as Record<string, unknown>)[key];
  }
  return current as number;
}

function writePath<T>(target: T, path: string[], value: number): T {
  const clone = structuredClone(target) as Record<string, unknown>;
  let cursor: Record<string, unknown> = clone;
  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    cursor[lastKey] = value;
  }
  return clone as T;
}
