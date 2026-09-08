// 한국어 어절을 토큰으로 바꾸는 규칙 기반 토크나이저.
//
// 사전 없이 조사를 떼는 일은 원리적으로 완전할 수 없다. 조사 '가'와
// 명사 끝음절 '가'(전문가)는 문자열만 봐서는 구별되지 않기 때문이다.
// 그래서 이 파일은 정확도를 끝까지 올리려 하지 않는다. 대신
// "명사를 부수지 않는 것"을 우선하고, 남는 판단은 불용어로 사용자에게 넘긴다.
(function attachTokenizer(global) {
  const namespace = global.TfidfLab || (global.TfidfLab = {});

  const HANGUL_WORD_PATTERN = /^[가-힣]+$/;
  const NUMBER_ONLY_PATTERN = /^\d+$/;

  // 2글자 이상이라 명사 끝음절과 겹칠 여지가 거의 없는 조사.
  // 근거 검사 없이 바로 뗀다.
  const SAFE_SUFFIXES = [
    "으로부터",
    "에게서는",
    "에게서",
    "으로는",
    "에서는",
    "이라는",
    "이라고",
    "이지만",
    "까지는",
    "부터는",
    "들에게서",
    "들에게는",
    "들에게",
    "들에서",
    "들까지",
    "들부터",
    "들의",
    "들이",
    "들은",
    "들을",
    "들과",
    "처럼",
    "으로",
    "에서",
    "에게",
    "한테",
    "이랑",
    "보다",
    "까지",
    "부터",
    "조차",
    "마저",
    "밖에",
    "과",
    "와",
    "은",
    "는",
    "을",
    "를",
    "에",
    // '의'도 안전 티어다. 명사가 '의'로 끝나는 경우는 거의 2글자(회의, 정의,
    // 강의)라 아래 길이 가드에 걸리고, 3글자 이상은 사실상 X주의뿐이라
    // 예외 한 줄로 막힌다.
    "의",
    "만",
    "로",
  ];

  // 1글자 조사 중에서도 "명사를 만드는 접미사"와 정면으로 겹치는 셋.
  //   -이 : 어린이, 곰팡이   -가 : 전문가, 예술가   -도 : 만족도, 신뢰도
  // 이 셋만 코퍼스 근거를 요구한다. 더 넓히면 짧은 글에서 조사가 거의
  // 떨어지지 않아 도구가 전처리를 안 하는 것처럼 보인다.
  const RISKY_SUFFIXES = ["이", "가", "도"];

  const RISKY_SUFFIX_SET = new Set(RISKY_SUFFIXES);
  const ALL_SUFFIXES = [...SAFE_SUFFIXES, ...RISKY_SUFFIXES];

  // 서술어 종결형. 여기서 규칙을 더 넓히지 않는다.
  // 뉴스체(밝혔다, 올랐다)까지 정규식으로 잡으려 하면 '있다'를 잡으려다
  // '소다'를 죽이는 식으로 오류가 옮겨 다닐 뿐이다. 뉴스체는 불용어
  // 프리셋으로 처리한다. (src/stopwords.js의 newsPredicates)
  const VERB_ENDING_PATTERN =
    /(습니다|습니까|합니다|입니다|됩니다|드립니다|하였다|했다|한다|된다|되다|이다|였다|겠다|하며|하면서)$/;

  // 길이 3 미만은 건드리지 않는다. 보다 / 소다 같은 짧은 말과 충돌한다.
  function isVerbForm(word) {
    return word.length >= 3 && VERB_ENDING_PATTERN.test(word);
  }

  // 1차 스캔과 토큰화가 반드시 같은 정제 규칙을 써야 한다.
  // 복사해 두면 두 패스가 조용히 어긋난다.
  function cleanText(text) {
    return String(text == null ? "" : text)
      .toLowerCase()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^0-9a-z가-힣\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitWords(text) {
    const cleaned = cleanText(text);
    return cleaned ? cleaned.split(" ").filter(Boolean) : [];
  }

  // 1차 스캔: 입력 문서 전체에서 원형 어절을 모아 절단 근거를 만든다.
  //   surfaces : 원형 그대로 관찰된 어절
  //   derived  : 어절에서 조사 후보를 "한 단계" 뗀 base -> 그 base를 만든 어절들
  //
  // derived를 재귀로 만들면 안 된다. 민주주의를 -> 민주주의 -> 민주주로 이어져
  // 근거가 스스로를 정당화하는 순환이 생긴다.
  function buildLexicon(documents, options) {
    const excludeVerbs = !options || options.excludeVerbs !== false;
    const surfaces = new Set();
    const derived = new Map();

    for (const document of documents) {
      for (const word of splitWords(document.text)) {
        if (!HANGUL_WORD_PATTERN.test(word)) {
          continue;
        }

        // 용언을 먼저 걸러야 한다. 있습니다 / 것입니다가 남으면
        // 있습니 / 것입니 같은 가짜 base를 공급해 잘못된 절단을 승인한다.
        if (excludeVerbs && isVerbForm(word)) {
          continue;
        }

        surfaces.add(word);
      }
    }

    for (const word of surfaces) {
      for (const suffix of ALL_SUFFIXES) {
        if (word.length <= suffix.length + 1 || !word.endsWith(suffix)) {
          continue;
        }

        const base = word.slice(0, -suffix.length);
        if (!derived.has(base)) {
          derived.set(base, new Set());
        }
        derived.get(base).add(word);
      }
    }

    return { surfaces, derived };
  }

  // base가 코퍼스 안에서 "자기 자신 말고 다른 어절"의 근거로도 관찰되는가.
  //
  //   국민이 -> 국민 : 국민의가 근거가 된다 -> 절단
  //   전문가 -> 전문 : 전문을 만드는 어절이 전문가 자신뿐이다 -> 절단 거부
  //
  // 제외 대상이 둘인 것이 중요하다.
  //   origin  : 절단 루프에 들어온 최초 어절
  //   current : 지금 자르려는 형태 (앞 단계에서 잘라 만든 중간 형태일 수 있다)
  // current를 빼지 않으면 전문가는 -> 전문가로 자른 뒤 전문가 -> 전문을
  // 판정할 때, 근거로 잡히는 전문가가 origin(전문가는)과 달라서 통과해 버린다.
  function hasStripEvidence(base, origin, current, lexicon) {
    if (!lexicon) {
      return true;
    }

    if (lexicon.surfaces.has(base)) {
      return true;
    }

    const sources = lexicon.derived.get(base);
    if (!sources) {
      return false;
    }

    for (const source of sources) {
      if (source !== origin && source !== current) {
        return true;
      }
    }

    return false;
  }

  function stripParticles(token, lexicon) {
    if (!HANGUL_WORD_PATTERN.test(token)) {
      return token;
    }

    const origin = token;
    let normalized = token;
    let changed = true;

    while (changed) {
      changed = false;

      for (const suffix of ALL_SUFFIXES) {
        // 2글자 이하로 줄어드는 절단은 하지 않는다.
        if (normalized.length <= suffix.length + 1 || !normalized.endsWith(suffix)) {
          continue;
        }

        // 민주주의 / 자본주의 / 사회주의의 '의'는 조사가 아니다.
        // 조사가 붙어 들어온 경우(민주주의를)에는 origin이 달라 근거 판정만으로
        // 막히지 않기 때문에 이 예외가 필요하다. 예외는 이것 하나뿐이다.
        if (suffix === "의" && normalized.endsWith("주의")) {
          continue;
        }

        const base = normalized.slice(0, -suffix.length);

        if (
          RISKY_SUFFIX_SET.has(suffix) &&
          !hasStripEvidence(base, origin, normalized, lexicon)
        ) {
          continue;
        }

        normalized = base;
        changed = true;
        break;
      }
    }

    return normalized;
  }

  // 토큰과 함께 "무엇이 왜 빠졌는지"를 돌려준다.
  // 학생이 자기가 뺀 것과 도구가 뺀 것을 눈으로 구분할 수 있어야 하므로
  // 제외 사유를 버리지 않고 모아 둔다.
  //
  // options
  //   minTokenLength   최소 토큰 길이 (기본 2)
  //   excludeNumbers   숫자만 있는 토큰 제외 (기본 true)
  //   excludeVerbs     서술어 제외 (기본 true)
  //   keepOriginal     조사·어미를 떼지 않고 입력 그대로 사용 (기본 false)
  //   stopwords        Set<string>
  //   lexicon          buildLexicon 결과
  function tokenize(text, options) {
    const settings = options || {};
    const minTokenLength = Number.isFinite(settings.minTokenLength)
      ? Math.max(1, settings.minTokenLength)
      : 2;
    const excludeNumbers = settings.excludeNumbers !== false;
    const keepOriginal = settings.keepOriginal === true;
    // 원문 그대로 모드에서는 용언 필터도 함께 끈다. 이미 정제된 입력을
    // 다시 손대지 않는 것이 이 모드의 목적이다.
    const excludeVerbs = !keepOriginal && settings.excludeVerbs !== false;
    const stopwords = settings.stopwords || new Set();
    const lexicon = keepOriginal ? null : settings.lexicon || null;

    const tokens = [];
    const surfaceForms = new Map();
    const removed = {
      stopword: new Map(),
      verb: new Map(),
      tooShort: new Map(),
      numeric: new Map(),
    };

    function note(bucket, word) {
      bucket.set(word, (bucket.get(word) || 0) + 1);
    }

    for (const word of splitWords(text)) {
      if (excludeVerbs && isVerbForm(word)) {
        note(removed.verb, word);
        continue;
      }

      const token = keepOriginal ? word : stripParticles(word, lexicon);

      if (!token) {
        continue;
      }

      if (excludeNumbers && NUMBER_ONLY_PATTERN.test(token)) {
        note(removed.numeric, token);
        continue;
      }

      if (token.length < minTokenLength) {
        note(removed.tooShort, token);
        continue;
      }

      if (stopwords.has(token)) {
        note(removed.stopword, token);
        continue;
      }

      tokens.push(token);

      if (!surfaceForms.has(token)) {
        surfaceForms.set(token, new Set());
      }
      surfaceForms.get(token).add(word);
    }

    return { tokens, surfaceForms, removed };
  }

  namespace.tokenizer = {
    ALL_SUFFIXES,
    SAFE_SUFFIXES,
    RISKY_SUFFIXES,
    VERB_ENDING_PATTERN,
    buildLexicon,
    cleanText,
    isVerbForm,
    splitWords,
    stripParticles,
    tokenize,
  };
})(typeof window !== "undefined" ? window : globalThis);
