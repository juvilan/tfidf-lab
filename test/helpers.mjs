import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

// 소스는 브라우저용 클래식 스크립트다. ES 모듈을 쓰면 file://에서 CORS로
// 막혀 학생이 HTML을 더블클릭해 열 수 없기 때문이다.
// 테스트에서는 vm 컨텍스트에 그대로 평가해서 불러온다. 외부 의존성 0.
const SOURCE_FILES = [
  "../src/tokenizer.js",
  "../src/stopwords.js",
  "../src/tfidf.js",
  "../corpus/index.js",
];

// 섹션 파일은 corpus/index.js가 먼저 읽힌 뒤에 등록한다.
const SECTION_FILES = [
  "../corpus/economy.js",
  "../corpus/politics.js",
  "../corpus/society.js",
  "../corpus/scitech.js",
  "../corpus/humanities.js",
  "../corpus/sports.js",
  "../corpus/entertainment.js",
  // 테마는 모든 섹션이 등록된 뒤에 묶는다.
  "../corpus/themes.js",
];

const FILES = [...SOURCE_FILES, ...SECTION_FILES];

function loadNamespace(files) {
  const context = vm.createContext({});

  for (const file of files) {
    const url = new URL(file, import.meta.url);
    // 아직 쓰지 않은 섹션 파일은 건너뛴다. 코퍼스를 채워 가는 동안에도
    // 토크나이저 테스트는 돌아가야 한다.
    if (!existsSync(url)) {
      continue;
    }
    vm.runInContext(readFileSync(url, "utf8"), context, { filename: file });
  }

  return context.TfidfLab;
}

export const lab = loadNamespace(FILES);

// vm 컨텍스트에서 만들어진 배열은 프로토타입이 달라 deepStrictEqual이
// 값이 같아도 실패한다. 호스트 realm으로 복사해서 쓴다.
export const toHostArray = (value) => [...value];

export function tokensOf(text, options = {}) {
  const documents = [{ id: "d1", text }];
  const lexicon = lab.tokenizer.buildLexicon(documents, options);
  return toHostArray(lab.tokenizer.tokenize(text, { ...options, lexicon }).tokens);
}

export function countsOf(text, options = {}) {
  const counts = new Map();
  for (const token of tokensOf(text, options)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}
