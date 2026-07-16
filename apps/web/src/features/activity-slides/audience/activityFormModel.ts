import type {
  ActivityAnswer,
  ActivityDefinition,
  ActivityResponse
} from "@orbit/shared";

export type SatisfactionDraft = {
  displayName: string;
  freeText: Record<string, string>;
  ratings: Record<string, number>;
};

export type SatisfactionDraftErrors = Record<string, string>;

export function createSatisfactionDraft(
  response: ActivityResponse | null
): SatisfactionDraft {
  const draft: SatisfactionDraft = {
    displayName: response?.displayName ?? "",
    freeText: {},
    ratings: {}
  };
  response?.answers.forEach((answer) => {
    if (answer.type === "rating") draft.ratings[answer.questionId] = answer.value;
    if (answer.type === "free-text") draft.freeText[answer.questionId] = answer.text;
  });
  return draft;
}

export function validateSatisfactionDraft(
  definition: ActivityDefinition,
  draft: SatisfactionDraft
): SatisfactionDraftErrors {
  const errors: SatisfactionDraftErrors = {};
  definition.questions.forEach((question) => {
    if (question.type === "rating" && question.required && !draft.ratings[question.questionId]) {
      errors[question.questionId] = "평점을 선택해 주세요.";
    }
    if (
      question.type === "free-text" &&
      question.required &&
      !(draft.freeText[question.questionId] ?? "").trim()
    ) {
      errors[question.questionId] = "답변을 입력해 주세요.";
    }
  });
  if (definition.allowDisplayName && draft.displayName.trim().length > 40) {
    errors.displayName = "이름은 40자 이하로 입력해 주세요.";
  }
  return errors;
}

export function buildSatisfactionAnswers(
  definition: ActivityDefinition,
  draft: SatisfactionDraft
): ActivityAnswer[] {
  const answers: ActivityAnswer[] = [];
  definition.questions.forEach((question) => {
    if (question.type === "rating") {
      const value = draft.ratings[question.questionId];
      if (value !== undefined) {
        answers.push({ questionId: question.questionId, type: "rating", value });
      }
    }
    if (question.type === "free-text") {
      const text = (draft.freeText[question.questionId] ?? "").trim();
      if (text) answers.push({ questionId: question.questionId, type: "free-text", text });
    }
  });
  return answers;
}

export function hasSatisfactionDraft(draft: SatisfactionDraft): boolean {
  return (
    draft.displayName.trim().length > 0 ||
    Object.keys(draft.ratings).length > 0 ||
    Object.values(draft.freeText).some((value) => value.trim().length > 0)
  );
}
