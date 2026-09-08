import test from "node:test";
import assert from "node:assert/strict";
import { lab, tokensOf, countsOf } from "./helpers.mjs";

test("조사가 붙은 명사는 하나로 통합된다", () => {
  const counts = countsOf("민주주의를 지키는 국민이 민주주의는 국민의 것");

  assert.equal(counts.get("국민"), 2, "국민이 / 국민의가 국민으로 합쳐져야 한다");
  assert.equal(counts.get("민주주의"), 2);
});

test("명사 끝음절 '의'는 조사로 오인되지 않는다", () => {
  const tokens = tokensOf("민주주의 자본주의 사회주의 민주주의를");

  assert.equal(
    tokens.filter((token) => token === "민주주").length,
    0,
    `민주주로 잘려서는 안 된다 (실제: ${tokens.join(", ")})`,
  );
  assert.equal(tokens.filter((token) => token === "민주주의").length, 2);
  assert.ok(tokens.includes("자본주의"));
  assert.ok(tokens.includes("사회주의"));
});

test("명사를 만드는 접미사를 조사로 오인하지 않는다", () => {
  const tokens = tokensOf("전문가 어린이 만족도 신뢰도 예술가");

  for (const word of ["전문가", "어린이", "만족도", "신뢰도", "예술가"]) {
    assert.ok(tokens.includes(word), `${word}가 원형으로 남아야 한다 (실제: ${tokens.join(", ")})`);
  }
});

test("원형과 조사형이 함께 나와도 잘리지 않는다", () => {
  // 전문가는 -> 전문가로 자른 뒤, 전문가 -> 전문 판정에서 근거로 쓰이는 것이
  // 방금 잘라 만든 전문가 자신이다. 이 순환을 막아야 한다.
  const tokens = tokensOf("전문가 전문가는 전문가의 전문가들은");

  assert.equal(
    tokens.filter((token) => token === "전문").length,
    0,
    `전문으로 잘려서는 안 된다 (실제: ${tokens.join(", ")})`,
  );
  assert.equal(tokens.filter((token) => token === "전문가").length, 4);
});

test("복합명사의 마지막 음절도 조사로 오인되지 않는다", () => {
  const tokens = tokensOf("소비자물가 소비자물가는 소비자물가가 상승했다");

  assert.equal(
    tokens.filter((token) => token === "소비자물").length,
    0,
    `소비자물로 잘려서는 안 된다 (실제: ${tokens.join(", ")})`,
  );
  assert.equal(tokens.filter((token) => token === "소비자물가").length, 3);
});

test("서술어는 토큰에서 제외되고 제외 사유가 남는다", () => {
  const text = "있습니다 하겠습니다 국민";
  const lexicon = lab.tokenizer.buildLexicon([{ id: "d1", text }], {});
  const result = lab.tokenizer.tokenize(text, { lexicon });

  assert.deepEqual([...result.tokens], ["국민"]);
  assert.deepEqual([...result.removed.verb.keys()].sort(), ["하겠습니다", "있습니다"].sort());
});

test("원문 그대로 모드에서는 조사도 서술어도 건드리지 않는다", () => {
  assert.deepEqual(tokensOf("민주주의 민주주의 국민", { keepOriginal: true }), [
    "민주주의",
    "민주주의",
    "국민",
  ]);
  assert.deepEqual(tokensOf("있습니다 국민", { keepOriginal: true }), ["있습니다", "국민"]);
});

test("불용어는 제외되고 사유별로 집계된다", () => {
  const text = "물가 물가 성장 3 가";
  const lexicon = lab.tokenizer.buildLexicon([{ id: "d1", text }], {});
  const result = lab.tokenizer.tokenize(text, {
    lexicon,
    stopwords: new Set(["성장"]),
  });

  assert.deepEqual([...result.tokens], ["물가", "물가"]);
  assert.equal(result.removed.stopword.get("성장"), 1);
  assert.equal(result.removed.numeric.get("3"), 1);
  assert.equal(result.removed.tooShort.get("가"), 1);
});

test("표면형 맵이 원문 어절을 보존한다", () => {
  const text = "국민 국민이 국민을 국민의";
  const lexicon = lab.tokenizer.buildLexicon([{ id: "d1", text }], {});
  const { surfaceForms } = lab.tokenizer.tokenize(text, { lexicon });

  assert.deepEqual([...surfaceForms.get("국민")].sort(), [
    "국민",
    "국민을",
    "국민의",
    "국민이",
  ]);
});

test("두 글자 명사는 길이 가드가 지켜 준다", () => {
  const tokens = tokensOf("물가 물가가 국가 국가는 회의 정의");

  assert.equal(tokens.filter((token) => token === "물").length, 0);
  assert.equal(tokens.filter((token) => token === "국").length, 0);
  assert.ok(tokens.includes("회의"));
  assert.ok(tokens.includes("정의"));
});
