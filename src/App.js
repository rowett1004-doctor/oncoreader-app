import React, { useState, useEffect, useMemo } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Search,
  RefreshCw,
  Menu,
  List,
  Star,
  Check,
  Play,
  X,
  Layers,
} from "lucide-react";

// ==========================================
const API_KEY =
  process.env.REACT_APP_GEMINI_API_KEY || "AIzaSyAuMEJY-TwZfdN4on7fsdFzVmoxo6-iAnM";

const RSS_FEEDS = [
  {
    name: "JCO (Clinical Oncology)",
    url: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=jco",
  },
  {
    name: "Annals of Oncology",
    url: "https://www.annalsofoncology.org/current.rss",
  },
  {
    name: "The Lancet Oncology",
    url: "https://www.thelancet.com/rssfeed/lanonc_current.xml",
  },
  {
    name: "NEJM Oncology",
    url: "https://onesearch-rss.nejm.org/api/specialty/rss?context=nejm&specialty=hematology-oncology",
  },
  {
    name: "JAMA Oncology",
    url: "https://jamanetwork.com/rss/site_159/174.xml",
  },
  {
    name: "JAMA Otolaryngology",
    url: "https://jamanetwork.com/rss/site_18/74.xml",
  },
  {
    name: "JCO Oncology Practice",
    url: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=op",
  },
  {
    name: "JCO Precision Oncology",
    url: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=po",
  },
  {
    name: "JCO Oncology Advances",
    url: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=oa",
  },
  {
    name: "ASCO Educational Book",
    url: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=edbk",
  },
  {
    name: "Nature Reviews Clin Onc",
    url: "https://www.nature.com/nrclinonc.rss",
  },
  { name: "npj Breast Cancer", url: "https://www.nature.com/npjbcancer.rss" },
  {
    name: "npj Precision Oncology",
    url: "https://www.nature.com/npjprecisiononcology.rss",
  },
  {
    name: "Clinical Cancer Research",
    url: "https://aacrjournals.org/rss/site_1000013/1000009.xml",
  },
  {
    name: "Cancer Discovery",
    url: "https://aacrjournals.org/rss/site_1000003/1000004.xml",
  },
  {
    name: "Cancer Research",
    url: "https://aacrjournals.org/rss/site_1000011/1000008.xml",
  },
];

const fetchArticles = async (feeds, onProgress) => {
  let allArticles = [];
  const total = feeds.length;

  for (let i = 0; i < total; i++) {
    const feed = feeds[i];
    onProgress(((i + 1) / total) * 100, `Fetching ${feed.name}...`);
    try {
      const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
        feed.url
      )}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();
      if (data.status === "ok") {
        const items = data.items.map((item) => ({
          id: item.guid || item.link,
          journal: feed.name,
          title: item.title,
          link: item.link,
          date: item.pubDate.split(" ")[0],
          summary: item.description || item.content || "",
          matchedKeywords: [],
        }));
        allArticles = [...allArticles, ...items];
      }
    } catch (e) {
      console.error(e);
    }
  }
  return allArticles;
};

export default function App() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });
  const [viewMode, setViewMode] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [aiSummary, setAiSummary] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);

  const [keywords, setKeywords] = useState(
    () =>
      localStorage.getItem("keywords") ||
      "immunotherapy, pembrolizumab, kras, egfr, nsclc"
  );
  const [selectedFeeds, setSelectedFeeds] = useState(() => {
    const saved = localStorage.getItem("selectedFeeds");
    return saved
      ? new Set(JSON.parse(saved))
      : new Set(RSS_FEEDS.map((f) => f.url));
  });

  useEffect(() => localStorage.setItem("keywords", keywords), [keywords]);
  useEffect(
    () =>
      localStorage.setItem(
        "selectedFeeds",
        JSON.stringify(Array.from(selectedFeeds))
      ),
    [selectedFeeds]
  );

  const toggleFeed = (url) => {
    const next = new Set(selectedFeeds);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedFeeds(next);
  };

  const refreshData = async () => {
    setLoading(true);
    const targetFeeds = RSS_FEEDS.filter((f) => selectedFeeds.has(f.url));
    const data = await fetchArticles(targetFeeds, (p, m) =>
      setProgress({ percent: p, message: m })
    );
    setArticles(data);
    setLoading(false);
  };

  const analyzeWithAI = async (article) => {
    if (!API_KEY || API_KEY.includes("넣으세요")) {
      alert("API 키를 입력해주세요!");
      return;
    }
    setAnalyzingId(article.id);
    try {
      const genAI = new GoogleGenerativeAI(API_KEY);

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

      const prompt = `당신은 종양내과 전문의입니다. 다음 논문 초록을 요약하세요.\n제목: ${article.title}\n초록: ${article.summary}\n[형식]\n1. 핵심요약(5줄)\n2. 임상적 의의\n3. 추천 대상`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      setAiSummary({ id: article.id, text: response.text() });
    } catch (e) {
      alert("AI 오류: " + e.message);
    }
    setAnalyzingId(null);
  };

  const keywordList = useMemo(
    () =>
      keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k),
    [keywords]
  );
  const filteredArticles = useMemo(() => {
    return articles
      .map((a) => {
        const content = (a.title + " " + a.summary).toLowerCase();
        const matched = keywordList.filter((k) => content.includes(k));
        return { ...a, matchedKeywords: matched };
      })
      .filter((a) => {
        if (viewMode === "interests" && a.matchedKeywords.length === 0)
          return false;
        if (
          searchTerm &&
          !a.title.toLowerCase().includes(searchTerm.toLowerCase())
        )
          return false;
        return true;
      });
  }, [articles, viewMode, searchTerm, keywordList]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <header className="h-14 border-b flex items-center justify-between px-4 bg-white shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-full lg:hidden"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-lg text-emerald-700">OncoReader</span>
        </div>
        <button
          onClick={refreshData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white rounded-full text-xs font-bold shadow hover:bg-emerald-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
          {loading ? "동기화..." : "새로고침"}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside
          className={`${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 absolute lg:relative w-64 h-full bg-white border-r z-20 transition-transform duration-300 flex flex-col shadow-lg lg:shadow-none`}
        >
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="space-y-1 mb-6">
              <button
                onClick={() => {
                  setViewMode("all");
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold ${
                  viewMode === "all"
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500"
                }`}
              >
                <List size={16} /> 전체 논문
              </button>
              <button
                onClick={() => {
                  setViewMode("interests");
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold ${
                  viewMode === "interests"
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500"
                }`}
              >
                <Star size={16} /> 관심 논문
              </button>
            </div>
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase px-2">
                키워드 설정
              </span>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full mt-2 p-2 text-xs border rounded-lg h-20 focus:border-emerald-500 outline-none resize-none bg-slate-50"
              />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase px-2 mb-2 block">
                저널 구독 ({selectedFeeds.size})
              </span>
              <div className="space-y-1">
                {RSS_FEEDS.map((feed) => (
                  <div
                    key={feed.url}
                    onClick={() => toggleFeed(feed.url)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-100 rounded text-xs font-medium text-slate-600"
                  >
                    <div
                      className={`w-3 h-3 rounded-sm border shrink-0 ${
                        selectedFeeds.has(feed.url)
                          ? "bg-emerald-500 border-emerald-500"
                          : "bg-white border-slate-300"
                      }`}
                    >
                      {selectedFeeds.has(feed.url) && (
                        <Check size={10} className="text-white" />
                      )}
                    </div>
                    <span className="truncate">{feed.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-slate-100 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-white rounded-xl p-2 flex items-center gap-2 border shadow-sm">
              <Search className="text-slate-400 ml-2" size={16} />
              <input
                type="text"
                placeholder="제목 검색..."
                className="flex-1 outline-none text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {loading && articles.length === 0 && (
              <div className="text-center py-10 text-slate-500 text-sm">
                <RefreshCw className="animate-spin mx-auto mb-2" />
                <p>{progress.message}</p>
              </div>
            )}

            {!loading && filteredArticles.length === 0 && (
              <div className="text-center py-20 text-slate-400">
                <Layers size={48} className="mx-auto mb-4 opacity-50" />
                <p>
                  표시할 논문이 없습니다.
                  <br />
                  '새로고침'을 누르세요.
                </p>
              </div>
            )}

            {filteredArticles.map((article, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                      {article.journal}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {article.date}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 leading-tight mb-2">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-emerald-600"
                    >
                      {article.title}
                    </a>
                  </h3>
                  {article.matchedKeywords.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-3">
                      {article.matchedKeywords.map((k) => (
                        <span
                          key={k}
                          className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-100"
                        >
                          #{k}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <button
                      onClick={() => analyzeWithAI(article)}
                      disabled={analyzingId === article.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 py-2 rounded-lg text-xs font-bold text-slate-600"
                    >
                      {analyzingId === article.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}{" "}
                      AI 요약
                    </button>
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg text-xs font-bold text-emerald-700"
                    >
                      원문 보기
                    </a>
                  </div>
                </div>
                {aiSummary && aiSummary.id === article.id && (
                  <div className="bg-slate-50 p-4 border-t text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                    <div className="flex justify-between items-center mb-2">
                      <strong className="text-emerald-700 flex items-center gap-2">
                        <Star size={14} /> AI 분석
                      </strong>
                      <button onClick={() => setAiSummary(null)}>
                        <X size={14} />
                      </button>
                    </div>
                    {aiSummary.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
