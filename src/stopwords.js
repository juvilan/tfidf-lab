// 불용어는 묶음(프리셋)으로만 제공한다.
//
// 무엇을 빼야 하는지는 글의 성격에 따라 달라진다. 정답을 코드에 박아 두면
// 학생이 판단할 거리가 사라진다. 그래서 "항상 적용되는 숨은 기본 목록"을
// 두지 않고, 모든 묶음을 화면에서 켜고 끄고 내용을 펼쳐 볼 수 있게 한다.
(function attachStopwords(global) {
  const namespace = global.TfidfLab || (global.TfidfLab = {});

  const PRESETS = [
    {
      id: "general",
      label: "일반 한국어",
      description: "접속어, 지시어, 정도 부사처럼 어떤 글에나 나오는 말",
      defaultOn: true,
      words: [
        "그리고", "그러나", "그래서", "그런데", "하지만", "또는", "혹은",
        "다만", "또한", "특히", "물론", "오히려", "이처럼", "이같은",
        "이번", "지난", "최근", "올해", "내년", "당시", "현재", "이제",
        "매우", "아주", "너무", "정말", "가장", "더욱", "훨씬", "조금",
        "다시", "이미", "아직", "여전히", "계속", "함께", "서로", "직접",
        "우리", "저희", "자신", "모두", "여러", "각각", "일부", "대부분",
        "무엇", "어떤", "어느", "이런", "그런", "저런", "여기", "거기",
        "이렇게", "그렇게", "때문", "통해", "위해", "대해", "관련", "따라",
        "대한", "경우", "사실", "정도", "가지", "만큼", "동안", "이후",
        "이전", "지금", "앞으로", "먼저", "다음", "마지막", "실제",
      ],
    },
    {
      id: "newsPredicates",
      label: "뉴스체 서술어",
      description: "기사에 자주 나오는 서술어. 밝혔다, 올랐다, 나타났다 같은 말",
      defaultOn: false,
      words: [
        "밝혔다", "말했다", "전했다", "덧붙였다", "강조했다", "지적했다",
        "설명했다", "발표했다", "제시했다", "내놨다", "내다봤다", "평가했다",
        "분석했다", "진단했다", "호소했다", "촉구했다", "요구했다", "나타났다",
        "조사됐다", "집계됐다", "개선됐다", "확인됐다", "전망된다", "분석된다",
        "예상된다", "관측된다", "풀이된다", "늘었다", "줄었다", "올랐다",
        "내렸다", "떨어졌다", "높아졌다", "낮아졌다", "커졌다", "작아졌다",
        "나빠졌다", "좋아졌다", "이어졌다", "그쳤다", "멈췄다", "기록했다",
        "차지했다", "이끌었다", "달성했다", "나선다", "나온다", "이어진다",
        "커진다", "줄어든다", "있다", "없다", "같다", "크다",
        "높다", "낮다", "많다", "적다", "된다", "한다",
        "준다", "만든다", "생긴다", "오른다", "내린다", "늘어난다",
        "늘린다", "미룬다", "엇갈린다", "걸린다", "늦어진다", "않는다",
        "다르다", "어렵다", "불안하다", "위축됐다", "악화됐다", "겹쳤다",
        "돌아섰다", "넘었다", "많았다", "낮췄다", "나왔다", "꼽혔다",
        "갈렸다", "머물렀다", "들어갔다", "상쇄했다", "제자리다", "마찬가지다",
      ],
    },
    {
      id: "units",
      label: "수와 단위",
      description: "퍼센트, 포인트처럼 숫자를 따라다니는 단위",
      defaultOn: false,
      words: [
        "퍼센트", "포인트", "퍼센트포인트", "억원", "조원", "만원", "천원",
        "달러", "엔화", "유로", "억달러", "만명", "천명", "개월", "시간",
        "분기", "상반기", "하반기", "지난달", "지난해", "전년", "전월",
        "이상", "이하", "미만", "안팎", "가량", "정도", "수준",
      ],
    },
  ];

  const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

  // 켜진 프리셋과 사용자가 직접 고른 단어를 하나의 Set으로 합친다.
  // 출처를 알아야 화면에서 "프리셋이 뺀 것"과 "내가 뺀 것"을 구분할 수 있으므로
  // sources 맵도 함께 돌려준다.
  function buildStopwordSet(activePresetIds, customWords, keepWords) {
    const words = new Set();
    const sources = new Map();

    for (const presetId of activePresetIds || []) {
      const preset = PRESET_BY_ID.get(presetId);
      if (!preset) {
        continue;
      }

      for (const word of preset.words) {
        words.add(word);
        if (!sources.has(word)) {
          sources.set(word, preset.label);
        }
      }
    }

    for (const word of customWords || []) {
      const trimmed = String(word).trim().toLowerCase();
      if (!trimmed) {
        continue;
      }
      words.add(trimmed);
      sources.set(trimmed, "직접 추가");
    }

    // 묶음을 켜 두고도 그중 몇 개는 살리고 싶을 때가 있다.
    // 그러라고 묶음을 통째로 끄게 만들면 판단의 눈금이 너무 거칠어진다.
    for (const word of keepWords || []) {
      words.delete(word);
    }

    return { words, sources };
  }

  // 그 낱말이 어느 묶음에 들어 있는지 (없으면 null)
  function presetLabelOf(word, activePresetIds) {
    for (const presetId of activePresetIds || []) {
      const preset = PRESET_BY_ID.get(presetId);
      if (preset && preset.words.includes(word)) {
        return preset.label;
      }
    }
    return null;
  }

  function parseCustomInput(text) {
    return String(text == null ? "" : text)
      .split(/[\s,]+/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);
  }

  function defaultPresetIds() {
    return PRESETS.filter((preset) => preset.defaultOn).map((preset) => preset.id);
  }

  namespace.stopwords = {
    PRESETS,
    buildStopwordSet,
    defaultPresetIds,
    presetLabelOf,
    parseCustomInput,
  };
})(typeof window !== "undefined" ? window : globalThis);
