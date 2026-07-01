export function normalizeLiveTranscriptText(value: string) {
  const compactValue = value
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "")
    .trim();
  return normalizeKoreanNumberWords(compactValue);
}

const koreanNumberWordValues: Record<string, number> = {
  영: 0,
  공: 0,
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9
};
const koreanNumberWordPattern = /[영공일이삼사오육칠팔구십]+/g;
const koreanPercentNumberWordPattern = /([영공일이삼사오육칠팔구십]+)(프로|퍼센트)/g;

function normalizeKoreanNumberWords(value: string) {
  const withPercent = value.replace(
    koreanPercentNumberWordPattern,
    (match, word: string) => {
      const parsed = parseKoreanNumberWord(word);
      return parsed === null ? match : `${parsed}%`;
    }
  );

  return withPercent.replace(koreanNumberWordPattern, (word) => {
    const parsed = parseKoreanNumberWord(word);
    if (parsed === null || !shouldNormalizeStandaloneKoreanNumberWord(word)) {
      return word;
    }

    return `${parsed}`;
  });
}

function shouldNormalizeStandaloneKoreanNumberWord(word: string) {
  return word.includes("십");
}

function parseKoreanNumberWord(word: string) {
  if (word.length === 0) {
    return null;
  }

  if (word === "영" || word === "공") {
    return 0;
  }

  const tenIndex = word.indexOf("십");
  if (tenIndex === -1) {
    return koreanNumberWordValues[word] ?? null;
  }
  if (word.indexOf("십", tenIndex + 1) !== -1) {
    return null;
  }

  const tensWord = word.slice(0, tenIndex);
  const onesWord = word.slice(tenIndex + 1);
  const tens = tensWord === "" ? 1 : koreanNumberWordValues[tensWord];
  const ones = onesWord === "" ? 0 : koreanNumberWordValues[onesWord];
  if (tens === undefined || ones === undefined || tens === 0) {
    return null;
  }

  return tens * 10 + ones;
}
