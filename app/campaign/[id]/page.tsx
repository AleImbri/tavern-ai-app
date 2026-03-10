"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";
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

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inspectedCoin, setInspectedCoin] = useState<string | null>(null);

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
        let aiMessage = data.response;
        let aiData: any = null;

        try {
          aiData = JSON.parse(data.response);
          aiMessage = aiData.message || data.response;
        } catch (e) {
          console.error("Failed to parse AI JSON response:", e);
        }

        await addDoc(collection(db, "campaigns", campaignId, "messages"), {
          role: "model",
          content: aiMessage,
          timestamp: serverTimestamp(),
        });

        // Apply state updates if present
        if (aiData?.state_updates && campaign?.character) {
          let updatedChar = { ...campaign.character };
          const su = aiData.state_updates;

          // HP Update
          if (su.hpDelta) {
            updatedChar.currentHp = Math.min(
              Math.max(0, updatedChar.currentHp + su.hpDelta),
              updatedChar.maxHp
            );
          }

          // XP & Level Update
          if (su.xpDelta && su.xpDelta > 0) {
            updatedChar.xp += su.xpDelta;

            // D&D 5e Thresholds
            const xp = updatedChar.xp;
            let newLevel = 1;
            if (xp >= 6500) newLevel = 5;
            else if (xp >= 2700) newLevel = 4;
            else if (xp >= 900) newLevel = 3;
            else if (xp >= 300) newLevel = 2;

            if (newLevel > updatedChar.level) {
              updatedChar.level = newLevel;
            }
          }

          // Coins Update
          if (su.coinsDelta && updatedChar.coins) {
            updatedChar.coins = {
              cp: Math.max(0, updatedChar.coins.cp + (su.coinsDelta.cp || 0)),
              sp: Math.max(0, updatedChar.coins.sp + (su.coinsDelta.sp || 0)),
              gp: Math.max(0, updatedChar.coins.gp + (su.coinsDelta.gp || 0)),
              pp: Math.max(0, updatedChar.coins.pp + (su.coinsDelta.pp || 0)),
            };
          }

          // Inventory Updates
          let currentInv = [...(updatedChar.inventory || [])];

          if (su.inventoryAdd && Array.isArray(su.inventoryAdd)) {
            su.inventoryAdd.forEach((newItem: any) => {
              const existing = currentInv.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
              if (existing) {
                existing.quantity += (newItem.quantity || 1);
              } else {
                currentInv.push({ name: newItem.name, quantity: newItem.quantity || 1 });
              }
            });
          }

          if (su.inventoryRemove && Array.isArray(su.inventoryRemove)) {
            su.inventoryRemove.forEach((remItem: any) => {
              const existing = currentInv.find(i => i.name.toLowerCase() === remItem.name.toLowerCase());
              if (existing) {
                existing.quantity -= (remItem.quantity || 1);
              }
            });
            // Clean up 0 or negative items
            currentInv = currentInv.filter(i => i.quantity > 0);
          }

          updatedChar.inventory = currentInv;

          // Sync to Firestore
          try {
            await updateDoc(doc(db, "campaigns", campaignId), {
              character: updatedChar
            });
          } catch (err) {
            console.error("Failed to sync character state updates:", err);
          }
        }

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

  const calculateModifier = (score: number) => {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
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
      coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
      currentHp: maxHp,
      maxHp: maxHp,
      inventory: [
        { name: 'Sacco a pelo', quantity: 1 },
        { name: 'Acciarino e pietra focaia', quantity: 1 },
        { name: 'Torcia', quantity: 10 },
        { name: 'Razione', quantity: 10 },
        { name: 'Otre', quantity: 1 }
      ]
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
          title="Torna alla Gilda"
        >
          <svg className="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          <span className="hidden md:inline">Torna alla Gilda</span>
        </button>

        <div className="flex items-center justify-center truncate px-2">
          <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm uppercase tracking-widest font-serif truncate">
            {campaign?.title || "TavernAI"}
          </h1>
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] md:text-xs font-semibold bg-amber-900/30 text-amber-500 border border-amber-800/50 hidden md:inline-block shrink-0">
            5E MASTER
          </span>
        </div>

        <div className="flex justify-end gap-2 shrink-0">
          <button
            onClick={() => setIsInventoryOpen(true)}
            className="text-slate-300 hover:text-amber-400 font-serif flex items-center gap-2 transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800"
            title="Zaino"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <span className="hidden md:inline text-sm font-semibold">Zaino</span>
          </button>
          <button
            onClick={() => setIsSheetOpen(true)}
            className="text-slate-300 hover:text-amber-400 font-serif flex items-center gap-2 transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800"
            title="Scheda Personaggio"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="hidden md:inline text-sm font-semibold">Scheda</span>
          </button>
        </div>
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

      {/* Character Sheet Modal / Sidebar */}
      {isSheetOpen && campaign?.character && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSheetOpen(false)}
          ></div>

          {/* Sidebar */}
          <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-700/80 shadow-2xl shadow-black overflow-y-auto flex flex-col transform transition-transform duration-300 ease-in-out">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
              <h2 className="text-xl font-serif font-bold text-amber-500 tracking-wider">
                Scheda Personaggio
              </h2>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg p-2 transition-colors"
                title="Chiudi Scheda"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-8 flex-1">
              {/* Header Info */}
              <div className="text-center pb-6 border-b border-slate-800">
                <h3 className="text-3xl font-bold font-serif text-slate-100 mb-1">{campaign.character.name}</h3>
                <p className="text-amber-600/90 font-sans tracking-widest text-sm uppercase">
                  {campaign.character.race} {campaign.character.class}
                </p>
              </div>

              {/* Tokens Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-center flex flex-col justify-center">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Livello</span>
                  <span className="text-xl font-bold text-slate-200">{campaign.character.level}</span>
                </div>
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-center flex flex-col justify-center items-center">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">CA</span>
                  <div className="relative w-8 h-10 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full text-slate-700" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    <span className="relative z-10 text-sm font-bold text-white">
                      {10 + Math.floor((campaign.character.stats?.destrezza - 10) / 2)}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-center flex flex-col justify-center">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">XP</span>
                  <span className="text-lg font-bold text-slate-300">{campaign.character.xp}</span>
                </div>
                <div className="bg-slate-950/50 border border-red-900/30 rounded-lg p-3 text-center flex flex-col justify-center col-span-3">
                  <span className="text-xs text-red-500/70 uppercase tracking-wider font-semibold mb-1">Punti Ferita</span>
                  <span className="text-xl font-bold text-red-400">
                    {campaign.character.currentHp} <span className="text-slate-500 text-sm">/ {campaign.character.maxHp}</span>
                  </span>
                </div>
              </div>

              {/* Core Stats */}
              <div>
                <h4 className="text-sm font-serif text-slate-400 border-b border-slate-800 pb-2 mb-4">Caratteristiche</h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Forza", key: "forza" },
                    { label: "Destrezza", key: "destrezza" },
                    { label: "Costituzione", key: "costituzione" },
                    { label: "Intelligenza", key: "intelligenza" },
                    { label: "Saggezza", key: "saggezza" },
                    { label: "Carisma", key: "carisma" }
                  ].map((stat) => (
                    <div key={stat.key} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-2 flex flex-col items-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">{stat.label.substring(0, 3)}</span>
                      <span className="text-2xl font-serif text-amber-50 font-bold mb-1">
                        {campaign.character.stats?.[stat.key] || 10}
                      </span>
                      <span className="text-xs font-semibold bg-slate-950 px-2 py-0.5 rounded-full text-amber-500/90 border border-slate-800">
                        {calculateModifier(campaign.character.stats?.[stat.key] || 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lore & Aspects */}
              <div className="space-y-4 pt-4 border-t border-slate-800 text-sm">
                {campaign.character.physicalDescription && (
                  <div>
                    <h4 className="text-amber-600/80 font-serif mb-1 uppercase tracking-wider text-xs font-bold">Aspetto Fisico</h4>
                    <p className="text-slate-300 leading-relaxed font-sans bg-slate-950/30 p-3 rounded-lg border border-slate-800/50">
                      {campaign.character.physicalDescription}
                    </p>
                  </div>
                )}
                {campaign.character.background && (
                  <div>
                    <h4 className="text-amber-600/80 font-serif mb-1 uppercase tracking-wider text-xs font-bold">Background</h4>
                    <p className="text-slate-300 leading-relaxed font-sans italic bg-slate-950/30 p-3 rounded-lg border border-slate-800/50">
                      {campaign.character.background}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Modal / Sidebar */}
      {isInventoryOpen && campaign?.character && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsInventoryOpen(false)}
          ></div>

          {/* Sidebar */}
          <div className="relative w-full max-w-sm h-full bg-slate-900 border-l border-slate-700/80 shadow-2xl shadow-black overflow-y-auto flex flex-col transform transition-transform duration-300 ease-in-out">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
              <h2 className="text-xl font-serif font-bold text-amber-500 tracking-wider flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Zaino
              </h2>
              <button
                onClick={() => setIsInventoryOpen(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg p-2 transition-colors"
                title="Chiudi Zaino"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">

              {/* Portamonete */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <h3 className="text-xs font-serif font-bold text-slate-400 uppercase tracking-widest mb-4 text-center border-b border-slate-800/50 pb-2">Portamonete</h3>
                <div className="grid grid-cols-2 gap-6 justify-items-center py-4">
                  {/* MR (Rame) */}
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onPointerEnter={() => setInspectedCoin('copper')}
                    onPointerLeave={() => setInspectedCoin(null)}
                    onPointerCancel={() => setInspectedCoin(null)}
                  >
                    <Image src="/coins/copper.png" alt="Rame" width={144} height={144} className="w-36 h-36 object-contain scale-[1.5] hover:scale-[1.65] transition-transform mb-2 drop-shadow-lg" />
                    <span className="text-[10px] text-slate-400 font-sans uppercase tracking-widest">MR</span>
                    <span className="text-sm text-slate-200 font-sans font-medium">{campaign.character?.coins?.cp || 0}</span>
                  </div>

                  {/* MA (Argento) */}
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onPointerEnter={() => setInspectedCoin('silver')}
                    onPointerLeave={() => setInspectedCoin(null)}
                    onPointerCancel={() => setInspectedCoin(null)}
                  >
                    <Image src="/coins/silver.png" alt="Argento" width={144} height={144} className="w-36 h-36 object-contain scale-[1.5] hover:scale-[1.65] transition-transform mb-2 drop-shadow-lg" />
                    <span className="text-[10px] text-slate-400 font-sans uppercase tracking-widest">MA</span>
                    <span className="text-sm text-slate-200 font-sans font-medium">{campaign.character?.coins?.sp || 0}</span>
                  </div>

                  {/* MO (Oro) */}
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onPointerEnter={() => setInspectedCoin('gold')}
                    onPointerLeave={() => setInspectedCoin(null)}
                    onPointerCancel={() => setInspectedCoin(null)}
                  >
                    <Image src="/coins/gold.png" alt="Oro" width={144} height={144} className="w-36 h-36 object-contain scale-[1.5] hover:scale-[1.65] transition-transform mb-2 drop-shadow-lg" />
                    <span className="text-[10px] text-slate-400 font-sans uppercase tracking-widest">MO</span>
                    <span className="text-sm text-slate-200 font-sans font-medium">{campaign.character?.coins?.gp || 0}</span>
                  </div>

                  {/* MP (Platino) */}
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onPointerEnter={() => setInspectedCoin('platinum')}
                    onPointerLeave={() => setInspectedCoin(null)}
                    onPointerCancel={() => setInspectedCoin(null)}
                  >
                    <Image src="/coins/platinum.png" alt="Platino" width={144} height={144} className="w-36 h-36 object-contain scale-[1.5] hover:scale-[1.65] transition-transform mb-2 drop-shadow-lg" />
                    <span className="text-[10px] text-slate-400 font-sans uppercase tracking-widest">MP</span>
                    <span className="text-sm text-slate-200 font-sans font-medium">{campaign.character?.coins?.pp || 0}</span>
                  </div>
                </div>
              </div>

              {/* Inventario List */}
              <h3 className="text-xs font-serif font-bold text-slate-400 uppercase tracking-widest mt-2 border-b border-slate-800/50 pb-2">Equipaggiamento</h3>
              {!campaign.character.inventory || campaign.character.inventory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 space-y-3">
                  <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                  <p className="font-serif italic text-lg">Lo zaino è vuoto</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {campaign.character.inventory.map((item: any, idx: number) => (
                    <li key={idx} className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-3 flex justify-between items-center hover:bg-slate-800/50 transition-colors">
                      <span className="text-slate-200 font-sans tracking-wide">{item.name}</span>
                      <span className="text-amber-500/90 font-bold font-serif bg-amber-900/20 px-2 py-0.5 rounded border border-amber-800/30">
                        x{item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coin Inspection Lightbox */}
      {inspectedCoin && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none transition-opacity duration-300">
          <Image
            src={`/coins/${inspectedCoin}.png`}
            alt="Coin Detail"
            width={320}
            height={320}
            className="w-80 h-80 object-contain animate-in zoom-in duration-200 drop-shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
