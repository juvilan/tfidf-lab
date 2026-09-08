// TF / DF / IDF 계산.
//
// 값만 돌려주지 않고 분자와 분모를 함께 들고 다닌다. 수업 목표가 TF-IDF를
// 이해하는 것이므로 화면에 3/142 = 0.0211 처럼 보여줘야 하고, 그러려면
// 계산 결과가 어디서 온 숫자인지를 잃어버리면 안 된다.
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
        const tf = document.totalTerms > 0 ? count / document.totalTerms : 0;
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

      return { ...document, topKeywords };
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

  // 3 / 142 = 0.0211
  function formatFraction(numerator, denominator, digits = 4) {
    if (!denominator) {
      return "0";
    }
    return `${numerator} / ${denominator} = ${formatDecimal(numerator / denominator, digits)}`;
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
    formatFraction,
    normalizeIdfMode,
    toCsv,
  };
})(typeof window !== "undefined" ? window : globalThis);
