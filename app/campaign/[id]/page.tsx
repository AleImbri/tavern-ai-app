"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";

type Message = {
  id?: string;
  role: "user" | "model";
  content: string;
};

export default function CampaignChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [isCampaignLoading, setIsCampaignLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);
  const [campaign, setCampaign] = useState<any>(null);

  // Character Form State
  const [charName, setCharName] = useState("");
  const [charRace, setCharRace] = useState("Umano");
  const [charClass, setCharClass] = useState("Guerriero");

  const [stats, setStats] = useState({
    forza: 10,
    destrezza: 10,
    costituzione: 10,
    intelligenza: 10,
    saggezza: 10,
    carisma: 10,
  });

  const [background, setBackground] = useState("");
  const [physicalDesc, setPhysicalDesc] = useState("");
  const [isSavingChar, setIsSavingChar] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();

  const campaignId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!campaignId) return;

    const unsubCampaign = onSnapshot(doc(db, "campaigns", campaignId), (docSnap) => {
      if (docSnap.exists()) {
        setCampaign(docSnap.data());
      } else {
        router.push("/dashboard");
      }
      setIsCampaignLoading(false);
    });

    const q = query(collection(db, "campaigns", campaignId, "messages"), orderBy("timestamp", "asc"));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map((d) => ({
        id: d.id,
        role: d.data().role,
        content: d.data().content,
      }));
      setMessages(msgs);
      setIsMessagesLoading(false);
    });

    return () => {
      unsubCampaign();
      unsubscribeMsgs();
    };
  }, [campaignId, router]);

  useEffect(() => {
    if (!isCampaignLoading && !isMessagesLoading && campaign?.character && messages.length === 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      addDoc(collection(db, "campaigns", campaignId, "messages"), {
        role: "model",
        content: "Benvenuti coraggiosi avventurieri! Siete pronti a iniziare il vostro viaggio? Ditemi chi siete e da dove venite.",
        timestamp: serverTimestamp(),
      }).catch(console.error);
    }
  }, [campaign, messages.length, isCampaignLoading, isMessagesLoading, campaignId]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input;
    setInput("");
    setIsLoading(true);

    try {
      await addDoc(collection(db, "campaigns", campaignId, "messages"), {
        role: "user",
        content: userInput,
        timestamp: serverTimestamp(),
      });
      const history = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          history,
          message: userInput,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        await addDoc(collection(db, "campaigns", campaignId, "messages"), {
          role: "model",
          content: data.response,
          timestamp: serverTimestamp(),
        });
      } else {
        console.error("API Error:", data.error);
        setMessages((prev) => [...prev, { role: "model", content: "*(Una forza oscura impedisce al DM di comunicare... Riprova più tardi)*" }]);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      setMessages((prev) => [...prev, { role: "model", content: "*(Si è generato uno strappo nel tessuto magico. Connessione fallita.)*" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const calculateMaxHp = (cClass: string, constitution: number) => {
    const costMod = Math.floor((constitution - 10) / 2);
    let baseHp = 8;
    if (cClass === "Barbaro") baseHp = 12;
    if (["Guerriero", "Paladino", "Ranger"].includes(cClass)) baseHp = 10;
    if (["Mago", "Stregone"].includes(cClass)) baseHp = 6;
    return baseHp + costMod;
  };

  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim() || !campaignId) return;

    setIsSavingChar(true);
    const maxHp = calculateMaxHp(charClass, stats.costituzione);

    const characterData = {
      name: charName.trim(),
      race: charRace,
      class: charClass,
      stats: stats,
      background: background.trim(),
      physicalDescription: physicalDesc.trim(),
      level: 1,
      xp: 0,
      gold: 0,
      currentHp: maxHp,
      maxHp: maxHp
    };

    try {
      await updateDoc(doc(db, "campaigns", campaignId), {
        character: characterData
      });
    } catch (err) {
      console.error("Errore salvataggio personaggio:", err);
    } finally {
      setIsSavingChar(false);
    }
  };

  const handleStatChange = (stat: string, value: string) => {
    setStats(prev => ({ ...prev, [stat]: parseInt(value) || 10 }));
  };

  if (loading || isCampaignLoading || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 font-sans">
        <div className="flex flex-col items-center space-y-6">
          <svg className="animate-spin h-10 w-10 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-xl font-serif italic text-amber-400/80 animate-pulse tracking-wide">
            Apertura delle porte della taverna...
          </p>
        </div>
      </div>
    );
  }

  if (!campaign?.character) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-700/50 flex flex-col items-center p-4 md:p-8">
        <div className="w-full max-w-3xl bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/80 p-6 md:p-10">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm uppercase tracking-widest font-serif text-center mb-2">
            Forgia il tuo Destino
          </h1>
          <p className="text-slate-400 italic font-serif text-center mb-8">
            Prima di sederti al tavolo del Master, definisci chi sei.
          </p>

          <form onSubmit={handleCreateCharacter} className="space-y-8">
            {/* Base Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-serif text-amber-500 border-b border-slate-800 pb-2">Identità</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-1 md:col-span-3">
                  <label className="block text-sm font-medium text-slate-400 mb-1">Nome</label>
                  <input
                    type="text"
                    required
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-amber-600/50 text-slate-100 placeholder-slate-600"
                    placeholder="Eldrin, Thordak, o Seraphina..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Razza</label>
                  <select
                    value={charRace}
                    onChange={(e) => setCharRace(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-amber-600/50 text-slate-100"
                  >
                    {["Nano", "Elfo", "Halfling", "Umano", "Dragonide", "Gnomo", "Mezzelfo", "Mezzorco", "Tiefling"].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Classe</label>
                  <select
                    value={charClass}
                    onChange={(e) => setCharClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-amber-600/50 text-slate-100"
                  >
                    {["Barbaro", "Bardo", "Chierico", "Druido", "Guerriero", "Ladro", "Mago", "Monaco", "Paladino", "Ranger", "Stregone", "Warlock"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-4">
              <h2 className="text-xl font-serif text-amber-500 border-b border-slate-800 pb-2">Caratteristiche Base</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.keys(stats).map((stat) => (
                  <div key={stat}>
                    <label className="block text-sm font-medium text-slate-400 mb-1 capitalize">{stat}</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={20}
                      value={(stats as any)[stat]}
                      onChange={(e) => handleStatChange(stat, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-600/50 text-center text-slate-100 text-lg font-serif"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Lore */}
            <div className="space-y-4">
              <h2 className="text-xl font-serif text-amber-500 border-b border-slate-800 pb-2">Storia e Volto (Opzionale)</h2>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Descrizione Fisica</label>
                <textarea
                  value={physicalDesc}
                  onChange={(e) => setPhysicalDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-amber-600/50 text-slate-100 placeholder-slate-600 h-24 resize-none"
                  placeholder="Capelli corvini, una cicatrice sull'occhio destro..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Background</label>
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-amber-600/50 text-slate-100 placeholder-slate-600 h-32 resize-none"
                  placeholder="Un orfano cresciuto in un'antica città..."
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="text-slate-400 hover:text-slate-300 transition-colors px-4 py-2"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSavingChar || !charName.trim()}
                className="bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:from-amber-700 active:to-amber-800 text-amber-50 font-bold py-3 px-8 rounded-lg shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide flex justify-center items-center min-w-[200px]"
              >
                {isSavingChar ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  "Entra nella Taverna"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-700/50">
      {/* Header */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 shadow-md flex items-center justify-between shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-amber-500 hover:text-amber-400 font-serif flex items-center gap-1 transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          <span className="hidden sm:inline">Torna alla Gilda</span>
        </button>

        <div className="flex items-center justify-center">
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm uppercase tracking-widest font-serif">
            {campaign?.title || "TavernAI"}
          </h1>
          <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/30 text-amber-500 border border-amber-800/50 hidden sm:inline-block">
            5E MASTER
          </span>
        </div>

        {/* Empty div for flex balance against the back button */}
        <div className="w-[100px] sm:w-[150px] hidden sm:block"></div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <div className="max-w-4xl mx-auto space-y-6 flex flex-col">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-xl p-4 shadow-sm backdrop-blur-sm ${msg.role === "user"
                  ? "bg-slate-800/80 text-slate-100 border border-slate-700/50 rounded-br-sm"
                  : "bg-gradient-to-br from-indigo-950/40 to-slate-900/80 text-amber-50 border border-indigo-900/30 rounded-bl-sm font-serif text-lg leading-relaxed shadow-indigo-950/20"
                  }`}
              >
                {msg.role === "model" && (
                  <div className="flex items-center mb-2 text-indigo-400/80 text-sm font-sans uppercase tracking-wider font-semibold">
                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Dungeon Master
                  </div>
                )}
                {/* Use ReactMarkdown to render the content */}
                <div className="prose prose-invert prose-amber max-w-none font-serif leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start w-full">
              <div className="max-w-[85%] md:max-w-[75%] rounded-xl p-4 bg-gradient-to-br from-indigo-950/20 to-slate-900/40 border border-indigo-900/20 rounded-bl-sm font-serif italic text-slate-400 flex items-center space-x-2">
                <span>Il Master sta scrivendo il fato</span>
                <span className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shrink-0">
        <div className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            suppressHydrationWarning
            className="flex-1 bg-slate-950/50 border border-slate-700/50 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600/50 focus:border-transparent placeholder-slate-500 text-slate-100 transition-all font-sans"
            placeholder="Dichiara le tue azioni, avventuriero..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:from-amber-700 active:to-amber-800 text-amber-50 font-bold py-3 px-6 rounded-lg shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide flex items-center justify-center min-w-[100px]"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              "Lancia"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
