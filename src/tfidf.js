// TF / DF / IDF 계산.
//
// TF는 그 글에 나온 횟수를 그대로 쓴다. 고등학교 인공지능수학 교과서가
// 그렇게 정의하기 때문이다. 글 길이로 나누는 상대 빈도도 문헌에 나오는
// 정식 정의지만, 학생이 교과서 예제를 손으로 풀고 이 도구에 넣었을 때
// 숫자가 달라지면 도구가 없느니만 못하다.
//
// 대신 글 길이를 함께 들고 다닌다. 길이가 다른 글끼리 견줄 때 긴 글이
// 유리해진다는 점을 화면에서 짚어 줘야 하기 때문이다.
(function attachTfidf(global) {
  const namespace = global.TfidfLab || (global.TfidfLab = {});
  const tokenizer = namespace.tokenizer;

  const IDF_MODES = {
    ratio: {
      value: "ratio",
      label: "비율형",
      formula: "N / DF",
      describe: (n, df) => `${n} / ${df}`,
    },
    log10: {
      value: "log10",
      label: "상용로그형",
      formula: "log10(N / DF)",
      describe: (n, df) => `log10(${n} / ${df})`,
    },
  };

  function normalizeIdfMode(mode) {
    return mode === "log10" ? "log10" : "ratio";
  }

  function countTerms(tokens) {
    const counts = new Map();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    return counts;
  }

  function mergeRemoved(target, source) {
    for (const [reason, bucket] of Object.entries(source)) {
      const merged = target[reason];
      for (const [word, count] of bucket) {
        merged.set(word, (merged.get(word) || 0) + count);
      }
    }
  }

  // documents: [{ id, title, text, section?, fictional? }]
  // options  : minTokenLength, excludeNumbers, excludeVerbs, keepOriginal,
  //            stopwords(Set), idfMode
  function analyze(documents, options) {
    const settings = options || {};
    const idfMode = normalizeIdfMode(settings.idfMode);
    const idfModeMeta = IDF_MODES[idfMode];

    const inputs = (documents || []).filter(
      (document) => String(document.text || "").trim().length > 0,
    );

    // 1차 스캔에서 절단 근거를 만들고, 2차에서 그 근거로 토큰화한다.
    // 근거는 문서 내용에서만 나오므로 불용어를 바꿔도 토큰화 자체는 바뀌지
    // 않는다. 학생이 단어 하나를 뺐을 때 다른 분수가 흔들리면 안 되기 때문에
    // 이 성질이 중요하다.
    const lexicon = settings.keepOriginal
      ? null
      : tokenizer.buildLexicon(inputs, settings);

    const removedTotals = {
      stopword: new Map(),
      verb: new Map(),
      tooShort: new Map(),
      numeric: new Map(),
    };

    const analyzed = inputs.map((document, index) => {
      const title = String(document.title || `문서 ${index + 1}`).trim() || `문서 ${index + 1}`;
      const result = tokenizer.tokenize(document.text, { ...settings, lexicon });
      const termCounts = countTerms(result.tokens);

      mergeRemoved(removedTotals, result.removed);

      return {
        id: document.id || `doc-${index + 1}`,
        title,
        section: document.section || null,
        fictional: document.fictional === true,
        text: String(document.text || ""),
        tokens: result.tokens,
        surfaceForms: result.surfaceForms,
        removed: result.removed,
        totalTerms: result.tokens.length,
        uniqueTerms: termCounts.size,
        termCounts,
      };
    });

    const documentCount = analyzed.length;

    const totals = new Map();
    for (const document of analyzed) {
      for (const [term, count] of document.termCounts) {
        totals.set(term, (totals.get(term) || 0) + count);
      }
    }

    const vocabulary = [...totals.entries()]
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], "ko")))
      .map(([term]) => term);

    const rows = vocabulary.map((term) => {
      let df = 0;
      for (const document of analyzed) {
        if ((document.termCounts.get(term) || 0) > 0) {
          df += 1;
        }
      }

      const ratio = df > 0 ? documentCount / df : 0;
      const idf = idfMode === "log10" ? Math.log10(ratio) : ratio;

      const cells = analyzed.map((document) => {
        const count = document.termCounts.get(term) || 0;
        // TF = 등장 횟수. totalTerms는 계산에 쓰지 않고 글 길이를 보여 주는 데만 쓴다.
        const tf = count;
        return {
          docId: document.id,
          count,
          totalTerms: document.totalTerms,
          tf,
          score: tf * idf,
        };
      });

      return {
        term,
        totalCount: totals.get(term) || 0,
        df,
        documentCount,
        idf,
        idfMode,
        idfExpression: idfModeMeta.describe(documentCount, df),
        cells,
      };
    });

    const rowByTerm = new Map(rows.map((row) => [row.term, row]));

    const summaries = analyzed.map((document) => {
      const topKeywords = rows
        .map((row) => {
          const cell = row.cells.find((item) => item.docId === document.id);
          return { term: row.term, idf: row.idf, df: row.df, ...cell };
        })
        .filter((item) => item.count > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.count !== a.count) return b.count - a.count;
          return a.term.localeCompare(b.term, "ko");
        })
        .slice(0, 8);

      // 교과서는 빈도수가 가장 높은 단어를 「주제어」, TF-IDF가 가장 높은 단어를
      // 「유용한 정보」로 따로 부른다. 이 둘이 어긋나는 장면이 수업의 알맹이라
      // 주제어를 따로 뽑아 함께 들려 보낸다.
      const ranked = [...document.termCounts.entries()]
        .filter(([term]) => rowByTerm.has(term))
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0], "ko");
        });
      const topicWord = ranked.length > 0
        ? { term: ranked[0][0], count: ranked[0][1] }
        : null;

      return { ...document, topKeywords, topicWord };
    });

    return {
      documents: analyzed,
      documentCount,
      idfMode,
      idfModeMeta,
      removed: removedTotals,
      rowByTerm,
      rows,
      summaries,
      vocabulary,
    };
  }

  function formatDecimal(value, digits = 4) {
    return Number(value || 0).toFixed(digits);
  }

  function toCsv(rows) {
    return rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value == null ? "" : value).replace(/"/g, '""');
            return /[",\n]/.test(text) ? `"${text}"` : text;
          })
          .join(","),
      )
      .join("\n");
  }

  namespace.tfidf = {
    IDF_MODES,
    analyze,
    countTerms,
    formatDecimal,
    normalizeIdfMode,
    toCsv,
  };
})(typeof window !== "undefined" ? window : globalThis);
