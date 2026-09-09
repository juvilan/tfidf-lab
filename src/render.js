// 화면에 그리는 일만 맡는다. 상태를 바꾸지 않고, 무엇을 눌렀는지만
// 콜백으로 알린다. 계산 결과를 어떻게 보여 줄지가 이 파일에 모여 있다.
(function attachRender(global) {
  const namespace = global.TfidfLab || (global.TfidfLab = {});
  const { formatDecimal } = namespace.tfidf;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const BACKSLASH = String.fromCharCode(92);
  const REGEXP_SPECIALS = new Set([
    ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", BACKSLASH,
  ]);

  function escapeRegExp(value) {
    return [...String(value)]
      .map((character) => (REGEXP_SPECIALS.has(character) ? BACKSLASH + character : character))
      .join("");
  }

  // 빈 줄을 경계로 문단을 나눈다.
  function toParagraphs(text) {
    const paragraphs = [];
    let buffer = [];

    for (const line of String(text || "").split(String.fromCharCode(10))) {
      const trimmed = line.trim();
      if (trimmed) {
        buffer.push(trimmed);
      } else if (buffer.length > 0) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    }

    if (buffer.length > 0) {
      paragraphs.push(buffer.join(" "));
    }

    return paragraphs;
  }

  // 원문을 문단째 보여 준다. terms를 주면 그 말이 나온 자리에 표시를 남긴다.
  // 정규화형(국민)이 아니라 원문 표면형(국민이, 국민의)으로 찾아야
  // 어절 중간에서 끊기지 않는다.
  function renderArticleBody(text, terms) {
    const paragraphs = toParagraphs(text);

    const unique = [...new Set((terms || []).filter(Boolean))];
    const pattern = unique
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");

    return paragraphs
      .map((paragraph) => {
        if (!pattern) {
          return `<p>${escapeHtml(paragraph)}</p>`;
        }

        const regex = new RegExp(pattern, "gi");
        const parts = [];
        let last = 0;

        for (const match of paragraph.matchAll(regex)) {
          const at = match.index || 0;
          parts.push(escapeHtml(paragraph.slice(last, at)));
          parts.push(`<mark>${escapeHtml(match[0])}</mark>`);
          last = at + match[0].length;
        }

        parts.push(escapeHtml(paragraph.slice(last)));
        return `<p>${parts.join("")}</p>`;
      })
      .join("");
  }

  // ---------- 글 고르기 ----------

  function renderSections(container, sections, pickedIds) {
    container.innerHTML = sections
      .map(
        (section) => `
        <article class="pick-card">
          <h3>${escapeHtml(section.label)}</h3>
          <p class="desc">${escapeHtml(section.description)}</p>
          <button class="button tiny" type="button" data-add-section="${section.id}">
            다섯 편 모두 담기
          </button>
          <ul>
            ${section.articles
              .map(
                (article) => `
                <li>
                  <label>
                    <input type="checkbox" data-toggle-article="${article.id}"
                      ${pickedIds.has(article.id) ? "checked" : ""} />
                    <span>${escapeHtml(article.title)}</span>
                  </label>
                  <details class="peek">
                    <summary>본문 읽기</summary>
                    <div class="article-body">${renderArticleBody(article.text)}</div>
                  </details>
                </li>`,
              )
              .join("")}
          </ul>
        </article>`,
      )
      .join("");
  }

  function renderThemes(container, themes, pickedIds) {
    container.innerHTML = themes
      .map(
        (theme) => `
        <article class="pick-card">
          <h3>${escapeHtml(theme.label)}</h3>
          <p class="desc">${escapeHtml(theme.description)}</p>
          <button class="button tiny" type="button" data-add-theme="${theme.id}">
            다섯 편 모두 담기
          </button>
          <ul>
            ${theme.articles
              .map(
                (article) => `
                <li>
                  <label>
                    <input type="checkbox" data-toggle-article="${article.id}"
                      ${pickedIds.has(article.id) ? "checked" : ""} />
                    <span><span class="from">${escapeHtml(article.sectionLabel)}</span>
                      ${escapeHtml(article.title)}</span>
                  </label>
                  <details class="peek">
                    <summary>본문 읽기</summary>
                    <div class="article-body">${renderArticleBody(article.text)}</div>
                  </details>
                </li>`,
              )
              .join("")}
          </ul>
        </article>`,
      )
      .join("");
  }

  function renderBasket(container, documents) {
    if (documents.length === 0) {
      container.innerHTML =
        '<p class="basket-empty">아직 담은 글이 없습니다. 위에서 골라 주세요.</p>';
      return;
    }

    container.innerHTML = documents
      .map(
        (document) => `
        <div class="basket-item">
          <div class="basket-head">
            <span class="tag ${document.fictional ? "section" : "mine"}">${escapeHtml(
              document.sectionLabel || "내 글",
            )}</span>
            <span class="title">${escapeHtml(document.title)}</span>
            ${document.fictional ? '<span class="tag fictional">가상 기사</span>' : ""}
            <button class="button tiny" type="button" data-remove-doc="${document.id}">빼기</button>
          </div>
          <details class="peek">
            <summary>본문 읽기</summary>
            <div class="article-body">${renderArticleBody(document.text)}</div>
          </details>
        </div>`,
      )
      .join("");
  }

  // 2단계. 담은 글을 펼쳐 놓고 읽는 화면.
  function renderReading(container, documents) {
    if (documents.length === 0) {
      container.innerHTML =
        '<p class="basket-empty">담은 글이 없습니다. 1단계로 돌아가 골라 주세요.</p>';
      return;
    }

    container.innerHTML = documents
      .map(
        (document, index) => `
        <article class="read-card">
          <div class="read-head">
            <span class="read-num">${index + 1}</span>
            <h3>${escapeHtml(document.title)}</h3>
            ${
              document.fictional
                ? '<span class="tag fictional">가상 기사</span>'
                : '<span class="tag mine">내 글</span>'
            }
          </div>
          <div class="article-body">${renderArticleBody(document.text)}</div>
        </article>`,
      )
      .join("");
  }

  // ---------- 불용어 ----------

  function renderPresets(container, presets, activeIds, keepWords) {
    const kept = keepWords || new Set();

    container.innerHTML = presets
      .map((preset) => {
        const keptCount = preset.words.filter((word) => kept.has(word)).length;

        return `
        <details class="preset" data-open-key="preset:${preset.id}">
          <summary>
            <span class="preset-row">
              <input type="checkbox" data-toggle-preset="${preset.id}"
                ${activeIds.has(preset.id) ? "checked" : ""} />
              <span class="name">${escapeHtml(preset.label)}</span>
              <span class="desc">${escapeHtml(preset.description)}</span>
              ${keptCount > 0 ? `<span class="count-badge keep">${keptCount} 되살림</span>` : ""}
              <span class="count-badge">${preset.words.length}</span>
            </span>
          </summary>
          <p class="preset-hint">낱말을 누르면 그 낱말만 되살립니다. 다시 누르면 도로 뺍니다.</p>
          <div class="preset-words">
            ${preset.words
              .map(
                (word) =>
                  `<button class="word-toggle${
                    kept.has(word) ? " is-kept" : ""
                  }" type="button" data-toggle-word="${escapeHtml(word)}">${escapeHtml(
                    word,
                  )}</button>`,
              )
              .join("")}
          </div>
        </details>`;
      })
      .join("");
  }

  function renderKeepChips(container, words) {
    if (words.length === 0) {
      container.innerHTML = '<p class="hint">되살린 낱말이 아직 없습니다.</p>';
      return;
    }

    container.innerHTML = words
      .map(
        (word) =>
          `<button class="chip keep" type="button" data-unkeep="${escapeHtml(
            word,
          )}">${escapeHtml(word)}</button>`,
      )
      .join("");
  }

  function renderCustomChips(container, words) {
    container.innerHTML = words
      .map(
        (word) =>
          `<button class="chip" type="button" data-restore="${escapeHtml(word)}">${escapeHtml(
            word,
          )}</button>`,
      )
      .join("");
  }

  // ---------- 결과 ----------

  // 학생이 손으로 세지 않아도 되게, 분수에 쓰이는 숫자를 먼저 보여 준다.
  function renderTally(container, analysis) {
    const cards = [
      {
        label: "글 수 (N)",
        value: `${analysis.documentCount}<small> 편</small>`,
      },
      ...analysis.documents.map((document) => ({
        label: `${document.title} — 글 길이`,
        value: `${document.totalTerms}<small> 낱말 (서로 다른 낱말 ${document.uniqueTerms})</small>`,
      })),
    ];

    container.innerHTML = cards
      .map(
        (card) => `
        <div class="tally-card">
          <span class="label">${escapeHtml(card.label)}</span>
          <span class="value">${card.value}</span>
        </div>`,
      )
      .join("");
  }

  function renderSummaries(container, analysis) {
    container.innerHTML = analysis.summaries
      .map(
        (document) => `
        <article class="summary-card">
          <h3>${escapeHtml(document.title)}</h3>
          <p class="meta">
            낱말 ${document.totalTerms}개
            ${document.fictional ? '· <span class="tag fictional">가상 기사</span>' : ""}
          </p>
          ${
            document.topKeywords.length === 0
              ? '<p class="meta">남은 낱말이 없어 핵심어를 뽑지 못했습니다.</p>'
              : document.topKeywords
                  .map(
                    (keyword, index) => `
                    <div class="keyword-line">
                      <span class="rank">${index + 1}</span>
                      <span class="term">${escapeHtml(keyword.term)}</span>
                      <span class="calc">${keyword.count}회 × ${formatDecimal(
                        keyword.idf,
                      )}</span>
                      <span class="score">${formatDecimal(keyword.score)}</span>
                    </div>`,
                  )
                  .join("")
          }
          ${
            document.topKeywords.length === 0
              ? ""
              : `<details class="peek" data-open-key="peek:${document.id}">
                  <summary>원문에서 확인하기 (상위 3개 표시)</summary>
                  <div class="article-body">${renderArticleBody(
                    document.text,
                    document.topKeywords
                      .slice(0, 3)
                      .flatMap((keyword) => [
                        ...(document.surfaceForms.get(keyword.term) || [keyword.term]),
                      ]),
                  )}</div>
                </details>`
          }
        </article>`,
      )
      .join("");
  }

  const REMOVED_LABELS = {
    stopword: "내가 뺀 낱말과 묶음",
    verb: "서술어로 판단해 뺌",
    tooShort: "한 글자라 뺌",
    numeric: "숫자만 있어 뺌",
  };

  function renderRemoved(container, analysis) {
    const groups = Object.entries(REMOVED_LABELS)
      .map(([key, label]) => {
        const bucket = analysis.removed[key];
        const entries = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
        return { key, label, entries };
      })
      .filter((group) => group.entries.length > 0);

    if (groups.length === 0) {
      container.innerHTML = '<p class="hint">빠진 낱말이 없습니다.</p>';
      return;
    }

    container.innerHTML = groups
      .map(
        (group) => `
        <details class="removed-group" data-open-key="removed:${group.key}">
          <summary>${escapeHtml(group.label)} — ${group.entries.length}종
            (모두 ${group.entries.reduce((sum, entry) => sum + entry[1], 0)}번)</summary>
          <p class="removed-hint">낱말을 누르면 되살립니다.</p>
          <div class="removed-words">
            ${group.entries
              .map(
                ([word, count]) =>
                  `<button class="word-toggle" type="button" data-restore="${escapeHtml(
                    word,
                  )}">${escapeHtml(word)} <span class="n">${count}</span></button>`,
              )
              .join("")}
          </div>
        </details>`,
      )
      .join("");
  }

  function termCell(term) {
    return `<div class="term-cell">
      <button class="drop" type="button" data-drop="${escapeHtml(term)}"
        title="${escapeHtml(term)} 빼기" aria-label="${escapeHtml(term)} 빼기">&times;</button>
      <span class="word">${escapeHtml(term)}</span>
    </div>`;
  }

  function renderDfIdfTable(container, analysis, rows) {
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>낱말</th>
            <th>모두 몇 번</th>
            <th>DF (몇 편에)</th>
            <th>IDF</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
              <tr>
                <td>${termCell(row.term)}</td>
                <td>${row.totalCount}</td>
                <td>${row.df} / ${row.documentCount}</td>
                <td>
                  <span class="cell-main ${row.idf === 0 ? "zero" : ""}">${formatDecimal(
                    row.idf,
                  )}</span>
                  <span class="cell-calc">${escapeHtml(row.idfExpression)}</span>
                </td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function renderMatrix(container, analysis, rows, kind) {
    const header = analysis.documents
      .map((document) => `<th>${escapeHtml(document.title)}</th>`)
      .join("");

    container.innerHTML = `
      <table>
        <thead><tr><th>낱말</th>${header}</tr></thead>
        <tbody>
          ${rows
            .map((row) => {
              const cells = row.cells
                .map((cell) => {
                  if (kind === "tf") {
                    // TF는 횟수 그대로다. 소수로 늘려 적으면 오히려 헷갈린다.
                    return `<td>
                      <span class="cell-main ${cell.count === 0 ? "zero" : ""}">${
                        cell.count
                      }</span>
                      <span class="cell-calc">회</span>
                    </td>`;
                  }

                  return `<td>
                    <span class="cell-main ${cell.score === 0 ? "zero" : ""}">${formatDecimal(
                      cell.score,
                    )}</span>
                    <span class="cell-calc">${cell.count}회 × ${formatDecimal(row.idf)}</span>
                  </td>`;
                })
                .join("");
              return `<tr><td>${termCell(row.term)}</td>${cells}</tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  }

  namespace.render = {
    escapeHtml,
    renderArticleBody,
    renderBasket,
    renderCustomChips,
    renderDfIdfTable,
    renderKeepChips,
    renderMatrix,
    renderPresets,
    renderReading,
    renderRemoved,
    renderSections,
    renderSummaries,
    renderTally,
    renderThemes,
  };
})(typeof window !== "undefined" ? window : globalThis);
