// 섹션을 가로지르는 테마 묶음.
//
// 한 섹션 안에서 다섯 편을 고르면 공통어의 DF가 올라가는 장면을 볼 수 있다.
// 그런데 섹션을 마구 섞으면 어휘가 겹치지 않아 거의 모든 낱말의 DF가 1이 된다.
// IDF가 전부 같아져서 TF-IDF가 사실상 TF가 되고, 비교할 거리가 사라진다.
//
// 그래서 서른다섯 편에 세 갈래를 일부러 심어 두었고, 여기서 그 갈래를
// 묶음으로 꺼내 쓴다. 섹션이 달라도 공통 낱말이 있어 DF가 갈린다.
//
// 이 파일은 모든 섹션 파일보다 뒤에 읽혀야 한다.
(function attachThemes(global) {
  const corpus = global.TfidfLab.corpus;

  corpus.registerThemes([
    {
      id: "ai-data",
      label: "인공지능과 데이터",
      description: "다섯 분야가 같은 기술을 저마다 다르게 다룬다",
      articleIds: [
        "scitech-1", // 언어 모델
        "economy-4", // 반도체 수출
        "humanities-3", // 인공지능 윤리
        "sports-1", // 야구 데이터 분석
        "entertainment-5", // 웹툰 창작 도구
      ],
    },
    {
      id: "youth",
      label: "청년과 세대",
      description: "같은 세대를 일자리, 주거, 무대에서 각각 이야기한다",
      articleIds: [
        "economy-2", // 청년 고용
        "society-1", // 1인 가구
        "sports-5", // 육상 유망주
        "entertainment-3", // 신인 가수
        "humanities-4", // 구술 기록
      ],
    },
    {
      id: "region",
      label: "지역과 격차",
      description: "지역이라는 말이 분야마다 어떤 뜻으로 쓰이는지 견준다",
      articleIds: [
        "politics-3", // 지방자치
        "society-3", // 대중교통
        "society-5", // 고령화
        "economy-5", // 부동산
        "sports-2", // 축구 연고 리그
      ],
    },
  ]);
})(typeof window !== "undefined" ? window : globalThis);
