import test from "node:test";
import assert from "node:assert/strict";
import { lab } from "./helpers.mjs";

const { analyze } = lab.tfidf;

const DOCS = [
  { id: "a", title: "가", text: "물가 물가 성장 수출" },
  { id: "b", title: "나", text: "물가 내수 내수 고용" },
];

test("모든 문서에 나온 단어는 IDF가 0, 한 문서에만 나온 단어는 양수다", () => {
  const analysis = analyze(DOCS, { idfMode: "log10", minTokenLength: 2 });
  const idf = (term) => analysis.rowByTerm.get(term).idf;

  assert.equal(analysis.documentCount, 2);
  assert.equal(idf("물가"), 0, "두 문서 모두에 있는 물가의 IDF는 0");
  assert.ok(idf("성장") > 0);
  assert.ok(idf("내수") > 0);
});

test("문서가 1개면 상용로그형 IDF가 0이라 모든 점수가 0이다", () => {
  const analysis = analyze([DOCS[0]], { idfMode: "log10", minTokenLength: 2 });

  assert.equal(analysis.documentCount, 1);
  assert.ok(analysis.rows.length > 0);
  for (const row of analysis.rows) {
    assert.equal(row.idf, 0);
    for (const cell of row.cells) {
      assert.equal(cell.score, 0);
    }
  }
});

test("TF는 그 글에 나온 횟수 그대로다", () => {
  // 교과서가 TF를 횟수로 정의한다. 글 길이로 나누면 학생이 교과서 예제를
  // 손으로 풀었을 때와 숫자가 달라져 도구가 없느니만 못하다.
  const analysis = analyze(DOCS, { idfMode: "log10", minTokenLength: 2 });
  const docA = analysis.documents.find((document) => document.id === "a");
  const row = analysis.rowByTerm.get("물가");
  const cell = row.cells.find((item) => item.docId === "a");

  assert.equal(cell.count, docA.termCounts.get("물가"));
  assert.equal(cell.count, 2);
  assert.equal(cell.tf, 2, "TF는 횟수 그대로여야 한다");
  assert.equal(cell.score, cell.tf * row.idf);

  // 글 길이는 계산에 쓰지 않지만 화면에 보여 주려고 함께 들고 다닌다.
  assert.equal(cell.totalTerms, docA.totalTerms);

  assert.equal(row.df, 2);
  assert.equal(row.documentCount, 2);
  assert.equal(row.idfExpression, "log10(2 / 2)");
});

test("길이가 다른 글에서 같은 횟수면 TF도 같다", () => {
  // 횟수를 그대로 쓰므로 글 길이는 TF에 영향을 주지 않는다.
  // 대신 긴 글일수록 낱말이 여러 번 나오기 쉬워 결과적으로 유리해진다.
  const analysis = analyze(
    [
      { id: "short", title: "짧은 글", text: "물가 성장" },
      { id: "long", title: "긴 글", text: "물가 내수 고용 수출 소비 투자 금리 환율" },
    ],
    { idfMode: "ratio", minTokenLength: 2 },
  );

  const row = analysis.rowByTerm.get("물가");
  const short = row.cells.find((cell) => cell.docId === "short");
  const long = row.cells.find((cell) => cell.docId === "long");

  assert.equal(short.tf, 1);
  assert.equal(long.tf, 1);
  assert.equal(short.score, long.score, "횟수가 같으면 점수도 같아야 한다");
  assert.equal(short.totalTerms, 2);
  assert.equal(long.totalTerms, 8);
});

test("비율형 IDF는 N/DF 그대로다", () => {
  const analysis = analyze(DOCS, { idfMode: "ratio", minTokenLength: 2 });

  assert.equal(analysis.rowByTerm.get("물가").idf, 1);
  assert.equal(analysis.rowByTerm.get("성장").idf, 2);
  assert.equal(analysis.rowByTerm.get("성장").idfExpression, "2 / 1");
});

test("불용어를 빼도 다른 단어의 분자와 분모는 그 단어 몫만큼만 변한다", () => {
  // 재분석은 같은 문서로 근거 사전을 다시 만들 뿐이라 토큰화 자체는
  // 바뀌면 안 된다. 학생이 설명할 수 없는 이유로 분수가 흔들리면 곤란하다.
  const before = analyze(DOCS, { idfMode: "log10", minTokenLength: 2 });
  const after = analyze(DOCS, {
    idfMode: "log10",
    minTokenLength: 2,
    stopwords: new Set(["수출"]),
  });

  const docBefore = before.documents.find((document) => document.id === "a");
  const docAfter = after.documents.find((document) => document.id === "a");

  assert.equal(docAfter.totalTerms, docBefore.totalTerms - 1, "빠진 단어 몫만 줄어야 한다");
  assert.equal(after.rowByTerm.has("수출"), false);

  for (const term of ["물가", "성장"]) {
    const cellBefore = before.rowByTerm.get(term).cells.find((c) => c.docId === "a");
    const cellAfter = after.rowByTerm.get(term).cells.find((c) => c.docId === "a");
    assert.equal(cellAfter.count, cellBefore.count, `${term}의 등장 횟수는 그대로여야 한다`);
  }

  const docB = before.documents.find((document) => document.id === "b");
  const docBAfter = after.documents.find((document) => document.id === "b");
  assert.equal(docBAfter.totalTerms, docB.totalTerms, "다른 문서는 영향이 없어야 한다");
});

test("제거된 단어가 사유별로 집계된다", () => {
  const analysis = analyze([{ id: "a", title: "가", text: "물가 성장 3 가 상승했다" }], {
    minTokenLength: 2,
    stopwords: new Set(["성장"]),
  });

  assert.equal(analysis.removed.stopword.get("성장"), 1);
  assert.equal(analysis.removed.numeric.get("3"), 1);
  assert.equal(analysis.removed.tooShort.get("가"), 1);
  assert.equal(analysis.removed.verb.get("상승했다"), 1);
});

test("빈 문서는 계산에서 빠진다", () => {
  const analysis = analyze(
    [DOCS[0], { id: "empty", title: "빈 문서", text: "   " }],
    { minTokenLength: 2 },
  );

  assert.equal(analysis.documentCount, 1);
});

test("묶음을 켠 채로 낱말 하나만 되살릴 수 있다", () => {
  // 90개짜리 묶음에서 하나를 살리자고 나머지 89개를 함께 되살릴 수는 없다.
  const presetIds = ["newsPredicates"];
  const docs = [
    { id: "a", title: "가", text: "물가 있다 올랐다 수출" },
    { id: "b", title: "나", text: "물가 있다 올랐다 내수" },
  ];

  const all = lab.stopwords.buildStopwordSet(presetIds, [], new Set());
  assert.ok(all.words.has("있다") && all.words.has("올랐다"));

  const partial = lab.stopwords.buildStopwordSet(presetIds, [], new Set(["있다"]));
  assert.equal(partial.words.has("있다"), false, "되살린 낱말은 빠져야 한다");
  assert.ok(partial.words.has("올랐다"), "나머지 묶음은 그대로 남아야 한다");

  const analysis = analyze(docs, {
    minTokenLength: 2,
    stopwords: partial.words,
    keepWords: new Set(["있다"]),
  });
  assert.ok(analysis.rowByTerm.has("있다"));
  assert.equal(analysis.rowByTerm.has("올랐다"), false);
});

test("어느 묶음에 든 낱말인지 알려 준다", () => {
  assert.equal(lab.stopwords.presetLabelOf("밝혔다", ["newsPredicates"]), "뉴스체 서술어");
  assert.equal(lab.stopwords.presetLabelOf("밝혔다", ["general"]), null);
  assert.equal(lab.stopwords.presetLabelOf("없는낱말", ["general"]), null);
});
