// 상태를 들고 이벤트를 배선한다. 그리는 일은 render.js가 맡는다.
(function bootApp(global) {
  const lab = global.TfidfLab;
  const { corpus, render, stopwords, tfidf } = lab;

  const STORAGE_KEY = "tfidf-lab/v1";

  const el = (selector) => document.querySelector(selector);

  const ui = {
    sectionList: el("#section-list"),
    themeList: el("#theme-list"),
    ownTitle: el("#own-title"),
    ownText: el("#own-text"),
    ownAdd: el("#own-add"),
    basketList: el("#basket-list"),
    basketCount: el("#basket-count"),
    basketClear: el("#basket-clear"),
    idfFields: [...document.querySelectorAll('input[name="idf-mode"]')],
    minLength: el("#min-length"),
    visibleTerms: el("#visible-terms"),
    excludeNumbers: el("#exclude-numbers"),
    excludeVerbs: el("#exclude-verbs"),
    keepOriginal: el("#keep-original"),
    presetList: el("#preset-list"),
    customChips: el("#custom-chips"),
    customCount: el("#custom-count"),
    customInput: el("#custom-input"),
    analyze: el("#analyze"),
    status: el("#status"),
    results: el("#results"),
    tally: el("#tally"),
    summaries: el("#summaries"),
    removed: el("#removed"),
    idfCaption: el("#idf-caption"),
    dfidfTable: el("#dfidf-table"),
    tfTable: el("#tf-table"),
    tfidfTable: el("#tfidf-table"),
  };

  const state = {
    documents: [],
    presetIds: new Set(stopwords.defaultPresetIds()),
    customWords: [],
    ownCounter: 0,
    analysis: null,
  };

  let saveTimer = null;

  // ---------- 저장 ----------
  // 사생활 보호 모드나 용량 초과에서 예외가 나도 계산 기능은 살아 있어야 한다.

  function saveState() {
    try {
      const payload = {
        documents: state.documents,
        presetIds: [...state.presetIds],
        customWords: state.customWords,
        settings: readSettings(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      /* 저장에 실패해도 계속 쓸 수 있어야 한다 */
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 400);
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function clearStorage() {
    try {
      window.clearTimeout(saveTimer);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* 지우지 못해도 화면 초기화는 진행한다 */
    }
  }

  // ---------- 설정 ----------

  function readSettings() {
    const idfField = ui.idfFields.find((field) => field.checked);
    return {
      idfMode: idfField ? idfField.value : "ratio",
      minTokenLength: Number(ui.minLength.value) || 2,
      visibleTerms: Number(ui.visibleTerms.value) || 0,
      excludeNumbers: ui.excludeNumbers.checked,
      excludeVerbs: ui.excludeVerbs.checked,
      keepOriginal: ui.keepOriginal.checked,
    };
  }

  function applySettings(settings) {
    if (!settings) return;
    const idfField = ui.idfFields.find((field) => field.value === settings.idfMode);
    if (idfField) idfField.checked = true;
    if (settings.minTokenLength) ui.minLength.value = settings.minTokenLength;
    if (settings.visibleTerms != null) ui.visibleTerms.value = settings.visibleTerms;
    if (typeof settings.excludeNumbers === "boolean")
      ui.excludeNumbers.checked = settings.excludeNumbers;
    if (typeof settings.excludeVerbs === "boolean")
      ui.excludeVerbs.checked = settings.excludeVerbs;
    if (typeof settings.keepOriginal === "boolean")
      ui.keepOriginal.checked = settings.keepOriginal;
  }

  function setStatus(message, tone) {
    ui.status.textContent = message;
    ui.status.className = `status${tone ? ` ${tone}` : ""}`;
  }

  // ---------- 담은 글 ----------

  const pickedIds = () => new Set(state.documents.map((document) => document.id));

  function addArticle(articleId) {
    if (state.documents.some((document) => document.id === articleId)) return;
    const article = corpus.getArticle(articleId);
    if (article) state.documents.push({ ...article });
  }

  function removeDocument(documentId) {
    state.documents = state.documents.filter((document) => document.id !== documentId);
  }

  function refreshPickers() {
    const picked = pickedIds();
    render.renderSections(ui.sectionList, corpus.listSections(), picked);
    render.renderThemes(ui.themeList, corpus.listThemes(), picked);
    render.renderBasket(ui.basketList, state.documents);
    ui.basketCount.textContent = String(state.documents.length);
  }

  function refreshStopwordPanel() {
    render.renderPresets(ui.presetList, stopwords.PRESETS, state.presetIds);
    render.renderCustomChips(ui.customChips, state.customWords);
    ui.customCount.textContent = String(state.customWords.length);
  }

  // 결과를 보고 고른 낱말과 직접 적어 넣은 낱말을 합친다.
  function allCustomWords() {
    return [...new Set([...state.customWords, ...stopwords.parseCustomInput(ui.customInput.value)])];
  }

  function dropTerm(term) {
    if (!state.customWords.includes(term)) {
      state.customWords.push(term);
    }
    refreshStopwordPanel();
    saveState();
    analyze();
  }

  function restoreTerm(term) {
    state.customWords = state.customWords.filter((word) => word !== term);
    // 직접 적어 넣은 칸에도 있으면 함께 지운다. 그렇지 않으면 되돌려도 다시 빠진다.
    const typed = stopwords.parseCustomInput(ui.customInput.value).filter((word) => word !== term);
    ui.customInput.value = typed.join(", ");
    refreshStopwordPanel();
    saveState();
    analyze();
  }

  // ---------- 계산 ----------

  function analyze() {
    if (state.documents.length === 0) {
      setStatus("먼저 글을 담아 주세요.", "warn");
      ui.results.classList.add("hidden");
      return;
    }

    const settings = readSettings();
    const { words } = stopwords.buildStopwordSet([...state.presetIds], allCustomWords());

    const analysis = tfidf.analyze(state.documents, {
      idfMode: settings.idfMode,
      minTokenLength: settings.minTokenLength,
      excludeNumbers: settings.excludeNumbers,
      excludeVerbs: settings.excludeVerbs,
      keepOriginal: settings.keepOriginal,
      stopwords: words,
    });

    state.analysis = analysis;

    if (analysis.rows.length === 0) {
      setStatus("남은 낱말이 없습니다. 뺀 낱말이나 설정을 다시 살펴 주세요.", "warn");
      ui.results.classList.add("hidden");
      return;
    }

    const limit = Math.max(0, settings.visibleTerms);
    const rows = limit === 0 ? analysis.rows : analysis.rows.slice(0, limit);

    render.renderTally(ui.tally, analysis);
    render.renderSummaries(ui.summaries, analysis);
    render.renderRemoved(ui.removed, analysis);
    render.renderDfIdfTable(ui.dfidfTable, analysis, rows);
    render.renderMatrix(ui.tfTable, analysis, rows, "tf");
    render.renderMatrix(ui.tfidfTable, analysis, rows, "tfidf");
    ui.idfCaption.textContent = `IDF = ${analysis.idfModeMeta.formula} (N은 글 수, DF는 그 낱말이 나온 글 수)`;
    ui.results.classList.remove("hidden");

    const messages = [
      `글 ${analysis.documentCount}편에서 서로 다른 낱말 ${analysis.rows.length}개를 찾았습니다.`,
    ];

    if (limit > 0 && analysis.rows.length > limit) {
      messages.push(`표에는 상위 ${limit}개만 보여 줍니다.`);
    }

    if (settings.keepOriginal) {
      messages.push("원문 그대로 모드: 조사와 어미를 손대지 않았습니다.");
    }

    let tone = "good";

    if (analysis.documentCount === 1) {
      tone = "warn";
      messages.push(
        settings.idfMode === "log10"
          ? "글이 한 편이면 IDF = log10(1/1) = 0이라 모든 TF-IDF가 0이 됩니다. 두 편 이상 담아 보세요."
          : "글이 한 편이면 IDF가 모두 1이라 TF-IDF가 TF와 같아집니다. 두 편 이상 담아야 IDF가 일합니다.",
      );
    } else if (analysis.rows.some((row) => row.idf === 0)) {
      messages.push("모든 글에 나온 낱말은 IDF가 0이라 점수도 0입니다.");
    }

    setStatus(messages.join(" "), tone);
  }

  function reanalyzeIfShown() {
    if (state.analysis) analyze();
  }

  // ---------- CSV ----------

  function download(filename, content) {
    // 윈도우 엑셀은 BOM이 없으면 UTF-8로 읽지 않아 한글이 깨진다.
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function matrixCsv(analysis, kind) {
    const titles = analysis.documents.map((document) => document.title);
    const rows = [
      ["낱말", ...titles.map((title) => `${title} (값)`), ...titles.map((title) => `${title} (횟수/낱말수)`)],
      ...analysis.rows.map((row) => [
        row.term,
        ...row.cells.map((cell) => tfidf.formatDecimal(kind === "tf" ? cell.tf : cell.score, 6)),
        ...row.cells.map((cell) => `${cell.count}/${cell.totalTerms}`),
      ]),
    ];
    return tfidf.toCsv(rows);
  }

  function dfIdfCsv(analysis) {
    return tfidf.toCsv([
      ["낱말", "전체 횟수", "DF", "글 수(N)", "IDF", "IDF 식"],
      ...analysis.rows.map((row) => [
        row.term,
        row.totalCount,
        row.df,
        row.documentCount,
        tfidf.formatDecimal(row.idf, 6),
        row.idfExpression,
      ]),
    ]);
  }

  // ---------- 이벤트 ----------

  function onPickerClick(event) {
    const sectionButton = event.target.closest("[data-add-section]");
    if (sectionButton) {
      const section = corpus.getSection(sectionButton.dataset.addSection);
      section.articles.forEach((article) => addArticle(article.id));
      refreshPickers();
      saveState();
      setStatus(`${section.label} 다섯 편을 담았습니다.`, "good");
      reanalyzeIfShown();
      return;
    }

    const themeButton = event.target.closest("[data-add-theme]");
    if (themeButton) {
      const theme = corpus.getTheme(themeButton.dataset.addTheme);
      theme.articles.forEach((article) => addArticle(article.id));
      refreshPickers();
      saveState();
      setStatus(`${theme.label} 다섯 편을 담았습니다.`, "good");
      reanalyzeIfShown();
    }
  }

  function onPickerChange(event) {
    const toggle = event.target.closest("[data-toggle-article]");
    if (!toggle) return;

    if (toggle.checked) {
      addArticle(toggle.dataset.toggleArticle);
    } else {
      removeDocument(toggle.dataset.toggleArticle);
    }

    refreshPickers();
    saveState();
    reanalyzeIfShown();
  }

  ui.sectionList.addEventListener("click", onPickerClick);
  ui.themeList.addEventListener("click", onPickerClick);
  ui.sectionList.addEventListener("change", onPickerChange);
  ui.themeList.addEventListener("change", onPickerChange);

  ui.basketList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-doc]");
    if (!button) return;
    removeDocument(button.dataset.removeDoc);
    refreshPickers();
    saveState();
    reanalyzeIfShown();
  });

  ui.basketClear.addEventListener("click", () => {
    state.documents = [];
    state.analysis = null;
    refreshPickers();
    clearStorage();
    ui.results.classList.add("hidden");
    setStatus("담은 글을 모두 비웠습니다.");
  });

  ui.ownAdd.addEventListener("click", () => {
    const text = ui.ownText.value.trim();
    if (!text) {
      setStatus("내용을 적어 주세요.", "warn");
      return;
    }

    state.ownCounter += 1;
    state.documents.push({
      id: `own-${Date.now()}-${state.ownCounter}`,
      title: ui.ownTitle.value.trim() || `내 글 ${state.ownCounter}`,
      text,
      section: null,
      sectionLabel: null,
      fictional: false,
    });

    ui.ownTitle.value = "";
    ui.ownText.value = "";
    refreshPickers();
    saveState();
    setStatus("내 글을 담았습니다.", "good");
    reanalyzeIfShown();
  });

  ui.presetList.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-toggle-preset]");
    if (!toggle) return;

    if (toggle.checked) {
      state.presetIds.add(toggle.dataset.togglePreset);
    } else {
      state.presetIds.delete(toggle.dataset.togglePreset);
    }

    saveState();
    reanalyzeIfShown();
  });

  // 프리셋 이름을 눌러 펼칠 때 체크박스가 같이 눌리지 않게 한다.
  ui.presetList.addEventListener("click", (event) => {
    if (event.target.matches("[data-toggle-preset]")) {
      event.stopPropagation();
    }
  });

  ui.customChips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-restore]");
    if (chip) restoreTerm(chip.dataset.restore);
  });

  ui.removed.addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore]");
    if (button) restoreTerm(button.dataset.restore);
  });

  ui.customInput.addEventListener("input", () => {
    scheduleSave();
  });

  ui.customInput.addEventListener("change", reanalyzeIfShown);

  for (const container of [ui.dfidfTable, ui.tfTable, ui.tfidfTable]) {
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-drop]");
      if (button) dropTerm(button.dataset.drop);
    });
  }

  for (const field of [
    ui.minLength,
    ui.visibleTerms,
    ui.excludeNumbers,
    ui.excludeVerbs,
    ui.keepOriginal,
    ...ui.idfFields,
  ]) {
    field.addEventListener("change", () => {
      saveState();
      reanalyzeIfShown();
    });
  }

  ui.analyze.addEventListener("click", () => analyze());

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      for (const other of document.querySelectorAll(".tab")) {
        const active = other === tab;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
        el(`#tab-${other.dataset.tab}`).classList.toggle("hidden", !active);
      }
    });
  }

  el("#download-dfidf").addEventListener("click", () => {
    if (state.analysis) download("df-idf.csv", dfIdfCsv(state.analysis));
  });
  el("#download-tf").addEventListener("click", () => {
    if (state.analysis) download("tf.csv", matrixCsv(state.analysis, "tf"));
  });
  el("#download-tfidf").addEventListener("click", () => {
    if (state.analysis) download("tf-idf.csv", matrixCsv(state.analysis, "tfidf"));
  });

  // ---------- 시작 ----------

  const saved = loadState();

  if (saved && Array.isArray(saved.documents) && saved.documents.length > 0) {
    state.documents = saved.documents;
    if (Array.isArray(saved.presetIds)) state.presetIds = new Set(saved.presetIds);
    if (Array.isArray(saved.customWords)) state.customWords = saved.customWords;
    applySettings(saved.settings);
    setStatus("지난번에 담아 둔 글을 불러왔습니다. 계산하기를 눌러 보세요.");
  }

  refreshPickers();
  refreshStopwordPanel();
})(typeof window !== "undefined" ? window : globalThis);
