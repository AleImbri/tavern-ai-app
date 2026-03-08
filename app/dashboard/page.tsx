"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Campaign = {
    id: string;
    title: string;
    userId: string;
    createdAt: any;
};

export default function DashboardPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [newCampaignTitle, setNewCampaignTitle] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
    const [validationError, setValidationError] = useState("");

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "campaigns"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const activeCampaigns = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Campaign[];
            setCampaigns(activeCampaigns);
        });

        return () => unsubscribe();
    }, [user]);

    const handleLogout = async () => {
        await auth.signOut();
        router.push("/login");
    };

    const createCampaign = async (e: React.FormEvent) => {
        e.preventDefault();

        const title = newCampaignTitle.trim();
        if (!title || !user) return;

        const isDuplicate = campaigns.some(
            camp => camp.title.toLowerCase() === title.toLowerCase()
        );

        if (isDuplicate) {
            setValidationError("Hai già un'avventura con questo nome.");
            return;
        }

        setIsCreating(true);
        try {
            const docRef = await addDoc(collection(db, "campaigns"), {
                title: newCampaignTitle.trim(),
                userId: user.uid,
                createdAt: serverTimestamp()
            });
            setNewCampaignTitle("");
            router.push(`/campaign/${docRef.id}`);
        } catch (err) {
            console.error("Errore durante la creazione della campagna:", err);
        } finally {
            setIsCreating(false);
        }
    };

    const initiateDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        e.preventDefault();
        setCampaignToDelete(id);
        setIsModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!campaignToDelete) return;
        try {
            await deleteDoc(doc(db, "campaigns", campaignToDelete));
        } catch (err) {
            console.error("Errore durante l'eliminazione della campagna:", err);
        } finally {
            setIsModalOpen(false);
            setCampaignToDelete(null);
        }
    };

    const cancelDelete = () => {
        setIsModalOpen(false);
        setCampaignToDelete(null);
    };

    if (loading || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 font-sans">
                <div className="flex flex-col items-center space-y-6">
                    <svg className="animate-spin h-10 w-10 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-xl font-serif italic text-amber-400/80 animate-pulse tracking-wide">
                        Preparazione del tavolo da gioco...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-700/50">

            {/* Header */}
            <header className="p-4 bg-slate-900 border-b border-slate-800 shadow-md flex items-center justify-between shrink-0 sticky top-0 z-10">
                <div className="flex items-center">
                    <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm uppercase tracking-widest font-serif">
                        Gilda degli Eroi
                    </h1>
                </div>
                <button
                    onClick={handleLogout}
                    className="text-sm px-4 py-2 border flex items-center gap-2 border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors rounded-lg font-medium"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Disconnettiti
                </button>
            </header>

            <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-8">

                {/* Creation Section */}
                <section className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl shadow-lg backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-serif font-bold text-amber-500 uppercase tracking-wide">
                            Crea una nuova campagna
                        </h2>
                        <span className="text-sm font-semibold text-slate-400 bg-slate-950/50 px-3 py-1 rounded-full border border-slate-800 shadow-inner">
                            Locande aperte: {campaigns.length}/10
                        </span>
                    </div>
                    <form onSubmit={createCampaign} className="flex flex-col md:flex-row gap-4">
                        <input
                            type="text"
                            required
                            value={newCampaignTitle}
                            onChange={(e) => {
                                setNewCampaignTitle(e.target.value);
                                if (validationError) setValidationError("");
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600/50 text-slate-100 placeholder-slate-600 font-sans transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Es. Il Ritrovamento di Phandalin..."
                            disabled={isCreating || campaigns.length >= 10}
                        />
                        <button
                            type="submit"
                            disabled={isCreating || !newCampaignTitle.trim() || campaigns.length >= 10}
                            className="bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:from-amber-700 active:to-amber-800 text-amber-50 font-bold py-3 px-8 rounded-lg shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale uppercase tracking-wide flex items-center justify-center min-w-[150px]"
                        >
                            {isCreating ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                "Crea"
                            )}
                        </button>
                    </form>
                    {validationError && (
                        <p className="mt-4 text-sm text-red-400/90 font-serif italic text-center">
                            {validationError}
                        </p>
                    )}
                    {campaigns.length >= 10 && (
                        <p className="mt-4 text-sm text-red-400/90 font-serif italic text-center">
                            Hai raggiunto il limite massimo. Elimina una vecchia avventura per poterne iniziare di nuove.
                        </p>
                    )}
                </section>

                {/* Campaigns List */}
                <section className="space-y-4">
                    <h2 className="text-xl font-serif font-bold text-slate-300 mb-6 flex items-center gap-2">
                        Le tue Cronache
                    </h2>

                    {campaigns.length === 0 ? (
                        <div className="text-center p-12 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                            <p className="text-slate-500 italic font-serif text-lg">
                                La tua storia deve ancora essere scritta. Inizia una nuova avventura per cominciare.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {campaigns.map((camp) => (
                                <div
                                    key={camp.id}
                                    onClick={() => router.push(`/campaign/${camp.id}`)}
                                    className="group relative bg-slate-900 border border-slate-700/60 hover:border-amber-600/50 rounded-xl p-5 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-amber-900/10 overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => initiateDelete(e, camp.id)}
                                            className="text-slate-500 hover:text-red-400 bg-slate-950/80 p-2 rounded-lg transition-colors border border-transparent hover:border-red-900/50"
                                            title="Elimina"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>

                                    <h3 className="text-lg font-bold text-slate-200 group-hover:text-amber-400 pr-10 truncate font-serif mb-2 transition-colors">
                                        {camp.title}
                                    </h3>

                                    <div className="flex items-center text-xs text-slate-500 font-sans pt-3 border-t border-slate-800/80">
                                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {camp.createdAt?.toDate ? new Date(camp.createdAt.toDate()).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Oggi'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

            </main>

            {/* Delete Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-2xl shadow-black/80">
                        <h3 className="text-2xl font-serif font-bold text-amber-500 mb-2 truncate text-center tracking-wide">
                            TavernAI
                        </h3>
                        <p className="text-slate-300 text-center mb-8 font-sans leading-relaxed">
                            Sei sicuro di voler eliminare questa avventura? La tua storia andrà perduta nell'oblio per sempre.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={cancelDelete}
                                className="flex-1 py-3 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 font-semibold transition-colors border border-slate-700 hover:border-slate-500"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3 px-4 rounded-lg bg-red-900/60 hover:bg-red-800/80 active:bg-red-950/80 text-red-200 font-bold transition-colors border border-red-800/40 hover:border-red-600/50"
                            >
                                Elimina Avventura
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
