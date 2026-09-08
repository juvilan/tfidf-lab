// 수업용 예시 글 보관소.
//
// 여기 실린 글은 모두 지어낸 것이다. 실제 보도가 아니며 실존하는 인물,
// 기업, 기관, 통계를 담고 있지 않다. 인터넷에서 정제된 글을 찾는 일이
// 생각보다 어려워서, 수업 시간에 바로 쓸 수 있는 재료를 미리 갖춰 두려는
// 목적이다. 각 글에는 fictional 표시가 붙고 화면에도 뱃지로 드러난다.
//
// 섹션 파일(economy.js 등)은 이 파일보다 뒤에 읽혀야 한다.
(function attachCorpus(global) {
  const namespace = global.TfidfLab || (global.TfidfLab = {});

  const sections = [];
  const sectionById = new Map();
  const articleById = new Map();

  function register(section, articles) {
    const entry = {
      id: section.id,
      label: section.label,
      description: section.description || "",
      articles: [],
    };

    articles.forEach((article, index) => {
      const id = `${section.id}-${index + 1}`;
      const record = {
        id,
        section: section.id,
        sectionLabel: section.label,
        title: article.title,
        text: article.text.trim(),
        fictional: true,
      };
      entry.articles.push(record);
      articleById.set(id, record);
    });

    sections.push(entry);
    sectionById.set(entry.id, entry);
    return entry;
  }

  function listSections() {
    return sections;
  }

  function getSection(sectionId) {
    return sectionById.get(sectionId) || null;
  }

  function getArticle(articleId) {
    return articleById.get(articleId) || null;
  }

  function allArticles() {
    return [...articleById.values()];
  }

  namespace.corpus = {
    allArticles,
    getArticle,
    getSection,
    listSections,
    register,
  };
})(typeof window !== "undefined" ? window : globalThis);
