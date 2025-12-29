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
import striptags from "striptags";

// ==========================================
// [설정] .env 파일에서 키를 가져옵니다.
// ==========================================
const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safelyParseDate = (dateString) => {
  if (!dateString) return "Unknown";
  try {
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch (e) {}
  return dateString;
};

const fetchArticles = async (feeds, onProgress) => {
  let allArticles = [];
  const total = feeds.length;
  const parser = new DOMParser();

  for (let i = 0; i < total; i++) {
    const feed = feeds[i];
    onProgress(((i + 1) / total) * 100, `Fetching ${feed.name}...`);
    try {
      if (i > 0) await wait(200);
      // 우회 서버 사용
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
        feed.url
      )}&t=${Date.now()}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Network response was not ok");

      const text = await response.text();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const items = Array.from(xmlDoc.querySelectorAll("item"));

      const parsedItems = items.map((item) => {
        let rawDate = item.querySelector("pubDate")?.textContent;
        if (!rawDate)
          rawDate = item.getElementsByTagName("dc:date")[0]?.textContent;
        if (!rawDate) rawDate = item.querySelector("date")?.textContent;

        const description =
          item.querySelector("description")?.textContent ||
          item.querySelector("content")?.textContent ||
          "";
        const cleanSummary =
          striptags(description).slice(0, 300) + "...";

        return {
          id:
            item.querySelector("link")?.textContent ||
            Math.random().toString(36),
          journal: feed.name,
          title: item.querySelector("title")?.textContent || "",
          link: item.querySelector("link")?.textContent || "",
          date: safelyParseDate(rawDate),
          summary: cleanSummary,
          matchedKeywords: [],
        };
      });
      allArticles = [...allArticles, ...parsedItems];
    } catch (e) {
      console.warn(`Failed to fetch ${feed.name}`);
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
  const [dateRange, setDateRange] = useState("90d");
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

  const toggleAllFeeds = () => {
    if (selectedFeeds.size === RSS_FEEDS.length) {
      setSelectedFeeds(
        selectedFeeds.size === RSS_FEEDS.length
          ? new Set()
          : new Set(RSS_FEEDS.map((f) => f.url))
      );
    }
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
    if (!API_KEY) {
      alert("API 키 설정을 확인해주세요.");
      return;
    }
    setAnalyzingId(article.id);
    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const prompt = `당신은 종양내과 전문의입니다. 다음 논문 초록을 요약하세요.\n제목: ${article.title}\n초록: ${article.summary}\n[형식]\n1. 핵심요약(3줄)\n2. 임상적 의의\n3. 추천 대상`;
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
    const now = new Date();
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
        if (dateRange !== "all") {
          if (!a.date || a.date === "Unknown") return true;
          try {
            const articleDate = new Date(a.date);
            const diffDays = Math.ceil(
              Math.abs(now - articleDate) / (1000 * 60 * 60 * 24)
            );
            if (dateRange === "7d" && diffDays > 7) return false;
            if (dateRange === "30d" && diffDays > 30) return false;
            if (dateRange === "90d" && diffDays > 90) return false;
          } catch (e) {
            return true;
          }
        }
        return true;
      });
  }, [articles, viewMode, searchTerm, keywordList, dateRange]);

  const dateOptions = [
    { label: "7일", value: "7d" },
    { label: "30일", value: "30d" },
    { label: "90일", value: "90d" },
    { label: "전체", value: "all" },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <header className="h-14 border-b flex items-center justify-between px-4 bg-white shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-full lg:hidden"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-lg text-emerald-700 hidden sm:inline">
            OncoReader
          </span>
          <div className="relative max-w-xs w-full ml-2">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
              size={14}
            />
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-slate-100 border-none rounded-full py-1.5 pl-9 pr-4 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex bg-slate-100 p-1 rounded-lg mr-2">
            {dateOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                  dateRange === opt.value
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={refreshData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white rounded-full text-xs font-bold shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
            {loading ? "Sync" : "Sync"}
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden relative">
        <aside
          className={`${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 absolute lg:relative w-64 h-full bg-white border-r z-20 transition-transform duration-300 flex flex-col shadow-lg lg:shadow-none`}
        >
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <nav className="space-y-1 mb-6">
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
                {keywordList.length > 0 && (
                  <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                    {keywordList.length}
                  </span>
                )}
              </button>
            </nav>
            <div className="mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2 block">
                Keywords
              </span>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full p-2 text-xs border rounded-lg h-20 focus:border-emerald-500 outline-none resize-none bg-slate-50"
              />
            </div>
            <div>
              <div className="flex justify-between items-center px-2 mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Journals ({selectedFeeds.size})
                </span>
                <button
                  onClick={toggleAllFeeds}
                  className="text-[10px] text-emerald-600 font-bold hover:underline"
                >
                  Toggle All
                </button>
              </div>
              <div className="space-y-0.5">
                {RSS_FEEDS.map((feed) => (
                  <div
                    key={feed.url}
                    onClick={() => toggleFeed(feed.url)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded text-xs font-medium text-slate-600"
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
        <main className="flex-1 bg-slate-50 overflow-y-auto p-4 custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="md:hidden flex overflow-x-auto gap-2 pb-2">
              {dateOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setDateRange(o.value)}
                  className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold border ${
                    dateRange === o.value
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {loading && articles.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <RefreshCw
                  className="animate-spin mx-auto mb-3 text-emerald-500"
                  size={24}
                />
                <p className="text-sm font-medium text-slate-600">
                  {progress.message}
                </p>
                <p className="text-xs mt-1">{Math.round(progress.percent)}%</p>
              </div>
            )}
            {!loading && filteredArticles.length === 0 && (
              <div className="text-center py-20 text-slate-400">
                <Layers size={48} className="mx-auto mb-4 opacity-30" />
                <p>
                  표시할 논문이 없습니다.
                  <br />
                  <span className="text-xs">Sync 버튼을 눌러보세요.</span>
                </p>
              </div>
            )}
            {filteredArticles.map((article, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md truncate">
                      {article.journal}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {article.date}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 leading-snug mb-2 text-sm sm:text-base">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-emerald-600 transition-colors"
                    >
                      {article.title}
                    </a>
                  </h3>
                  {article.matchedKeywords.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-3">
                      {article.matchedKeywords.map((k) => (
                        <span
                          key={k}
                          className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-100 font-medium"
                        >
                          #{k}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                    <button
                      onClick={() => analyzeWithAI(article)}
                      disabled={analyzingId === article.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 py-2 rounded-lg text-xs font-bold text-slate-600 transition-colors"
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
                      className="flex-1 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg text-xs font-bold text-emerald-700 transition-colors"
                    >
                      원문 보기
                    </a>
                  </div>
                </div>
                {aiSummary && aiSummary.id === article.id && (
                  <div className="bg-slate-50 p-4 border-t border-slate-100 text-sm text-slate-700 whitespace-pre-line leading-relaxed relative animate-fadeIn">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-200">
                      <strong className="text-emerald-700 flex items-center gap-2 text-xs uppercase tracking-wider">
                        <Star size={12} fill="currentColor" /> AI Analysis
                      </strong>
                      <button
                        onClick={() => setAiSummary(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
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
      <style>{`.custom-scrollbar::-webkit-scrollbar{width:5px}.custom-scrollbar::-webkit-scrollbar-track{background:transparent}.custom-scrollbar::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:10px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#94a3b8}@keyframes fadeIn{from{opacity:0}to{opacity:1}}.animate-fadeIn{animation:fadeIn 0.3s ease-in}`}</style>
    </div>
  );
}
