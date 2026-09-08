// 섹션 하나를 통째로 분석해 DF 분포를 눈으로 확인하는 점검 스크립트.
// 테스트가 아니라 코퍼스를 쓰는 동안 성질을 보기 위한 도구다.
//   node test/inspect-section.mjs economy [--preset newsPredicates]
import { lab } from "./helpers.mjs";

const sectionId = process.argv[2] || "economy";
const presetFlag = process.argv.indexOf("--preset");
const extraPresets = presetFlag > -1 ? process.argv.slice(presetFlag + 1) : [];

const section = lab.corpus.getSection(sectionId);
if (!section) {
  console.error(`섹션을 찾을 수 없다: ${sectionId}`);
  process.exit(1);
}

const presetIds = [...lab.stopwords.defaultPresetIds(), ...extraPresets];
const { words } = lab.stopwords.buildStopwordSet(presetIds, []);

const analysis = lab.tfidf.analyze(section.articles, {
  idfMode: "log10",
  minTokenLength: 2,
  stopwords: words,
});

console.log(`[${section.label}] 문서 ${analysis.documentCount}편 / 적용 프리셋: ${presetIds.join(", ")}`);
console.log("");

for (const document of analysis.documents) {
  console.log(
    `  ${document.title}`.padEnd(46),
    `토큰 ${String(document.totalTerms).padStart(3)} / 고유 ${String(document.uniqueTerms).padStart(3)}`,
  );
}

const byDf = new Map();
for (const row of analysis.rows) {
  if (!byDf.has(row.df)) byDf.set(row.df, []);
  byDf.get(row.df).push(row);
}

console.log("\n--- DF 분포 ---");
for (const df of [...byDf.keys()].sort((a, b) => b - a)) {
  const rows = byDf.get(df);
  const idf = rows[0].idf.toFixed(4);
  console.log(`DF ${df} (IDF ${idf}) — ${rows.length}종`);
  if (df >= analysis.documentCount - 1) {
    console.log(`   ${rows.map((row) => `${row.term}(${row.totalCount})`).join(" ")}`);
  }
}

console.log("\n--- 문서별 상위 5 (TF-IDF) ---");
for (const summary of analysis.summaries) {
  const top = summary.topKeywords
    .slice(0, 5)
    .map((keyword) => `${keyword.term} ${keyword.score.toFixed(4)}`)
    .join("  |  ");
  console.log(`  ${summary.title}\n    ${top}`);
}

const leaked = analysis.rows.filter((row) => /다$/.test(row.term));
console.log(`\n--- 남은 서술어형 ${leaked.length}종 ---`);
console.log("  " + leaked.map((row) => `${row.term}(${row.totalCount})`).join(" "));
