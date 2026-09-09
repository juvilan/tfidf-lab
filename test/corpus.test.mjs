import test from "node:test";
import assert from "node:assert/strict";
import { lab } from "./helpers.mjs";

const EXPECTED_SECTIONS = [
  "economy",
  "politics",
  "society",
  "scitech",
  "humanities",
  "sports",
  "entertainment",
];

const sections = lab.corpus.listSections();
const articles = lab.corpus.allArticles();

function tokenCountOf(text) {
  const documents = [{ id: "x", text }];
  const lexicon = lab.tokenizer.buildLexicon(documents, {});
  return lab.tokenizer.tokenize(text, { lexicon, minTokenLength: 2 }).tokens.length;
}

test("일곱 섹션이 각각 다섯 편씩 있다", () => {
  assert.deepEqual(
    [...sections.map((section) => section.id)].sort(),
    [...EXPECTED_SECTIONS].sort(),
  );

  for (const section of sections) {
    assert.equal(section.articles.length, 5, `${section.label}은 다섯 편이어야 한다`);
  }

  assert.equal(articles.length, 35);
});

test("모든 글에 필요한 항목이 채워져 있다", () => {
  for (const article of articles) {
    assert.ok(article.id, "id가 있어야 한다");
    assert.ok(article.title.trim().length > 0, `${article.id}의 제목이 비었다`);
    assert.ok(article.text.trim().length > 0, `${article.id}의 본문이 비었다`);
    assert.ok(article.sectionLabel, `${article.id}의 섹션 이름이 없다`);
    assert.equal(article.fictional, true, `${article.id}에 가상 표시가 없다`);
  }
});

test("모든 문서의 단어 수가 70에서 130 사이다", () => {
  // 글자 수가 아니라 토큰 수로 재야 한다. 글자로 재면 테스트는 통과하는데
  // DF가 심심한 문서가 섞인다.
  //
  // 하한 70은 DF 성질에서 역산한 값이다. 이보다 짧으면 한 섹션 다섯 편이
  // 공통어를 나눠 가질 여지가 사라져 IDF가 0으로 떨어지는 장면을 못 본다.
  // 상한 130은 읽는 시간과 길이 편차에서 잡았다. TF가 등장 횟수 그대로라
  // 긴 문서가 그냥 유리해지므로 편차를 좁혀 둔다.
  for (const article of articles) {
    const count = tokenCountOf(article.text);
    assert.ok(
      count >= 70 && count <= 130,
      `${article.id} (${article.title}) 단어 ${count}개 — 70~130 범위를 벗어났다`,
    );
  }
});

test("제목과 본문이 서로 겹치지 않는다", () => {
  const titles = articles.map((article) => article.title);
  const texts = articles.map((article) => article.text);

  assert.equal(new Set(titles).size, titles.length, "제목이 중복됐다");
  assert.equal(new Set(texts).size, texts.length, "본문이 중복됐다");
});

test("한 섹션을 통째로 넣으면 공통어의 IDF가 0이 된다", () => {
  // 이 성질이 무너지면 수업에서 보여 줄 장면이 사라진다.
  for (const section of sections) {
    const analysis = lab.tfidf.analyze(section.articles, {
      idfMode: "log10",
      minTokenLength: 2,
    });

    const shared = analysis.rows.filter((row) => row.df === section.articles.length);
    assert.ok(
      shared.length >= 3,
      `${section.label}: 다섯 편 모두에 나오는 낱말이 ${shared.length}종뿐이다`,
    );

    for (const row of shared) {
      assert.equal(row.idf, 0);
    }
  }
});

test("각 글의 최고 점수 낱말이 그 글에만 있는 낱말이다", () => {
  // 모든 글에 나오는 낱말은 IDF가 0이라 상위에 오를 수 없어야 한다.
  for (const section of sections) {
    const analysis = lab.tfidf.analyze(section.articles, {
      idfMode: "log10",
      minTokenLength: 2,
    });

    for (const summary of analysis.summaries) {
      const top = summary.topKeywords[0];
      assert.ok(top, `${summary.title}에 상위 낱말이 없다`);
      assert.ok(
        top.score > 0,
        `${summary.title}의 최고 점수가 0이다 — 모든 낱말이 모든 글에 나온다는 뜻`,
      );
    }
  }
});

test("테마 묶음은 섹션을 가로지르고 공통 낱말을 가진다", () => {
  const themes = lab.corpus.listThemes();
  assert.ok(themes.length >= 3);

  for (const theme of themes) {
    assert.deepEqual([...theme.missing], [], `${theme.label}에 없는 글이 걸려 있다`);
    assert.equal(theme.articles.length, 5);

    const sectionIds = new Set(theme.articles.map((article) => article.section));
    assert.ok(
      sectionIds.size >= 4,
      `${theme.label}: ${sectionIds.size}개 섹션뿐 — 가로지르는 묶음이 아니다`,
    );

    // 섹션을 섞어도 공통 낱말이 있어야 한다. 없으면 모든 DF가 1이 되어
    // IDF가 전부 같아지고 TF-IDF가 사실상 TF가 된다.
    const analysis = lab.tfidf.analyze(theme.articles, {
      idfMode: "log10",
      minTokenLength: 2,
    });
    const shared = analysis.rows.filter((row) => row.df >= 4);
    assert.ok(
      shared.length >= 2,
      `${theme.label}: 네 편 이상에 나오는 낱말이 ${shared.length}종뿐이다`,
    );
  }
});

test("불용어 프리셋에 중복이 없다", () => {
  for (const preset of lab.stopwords.PRESETS) {
    assert.equal(
      new Set(preset.words).size,
      preset.words.length,
      `${preset.label}에 중복된 낱말이 있다`,
    );
  }
});
