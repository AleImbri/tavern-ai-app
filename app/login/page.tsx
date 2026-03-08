"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message || "Errore di autenticazione");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError("");
        setIsLoading(true);
        const provider = new GoogleAuthProvider();

        try {
            await signInWithPopup(auth, provider);
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message || "Errore con l'accesso Google");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-700/50 p-4">

            <div className="w-full max-w-md p-8 space-y-8 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/50">

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm uppercase tracking-widest font-serif">
                        TavernAI
                    </h1>
                    <p className="text-slate-400 italic font-serif">
                        Unisciti alla nostra gilda, avventuriero!
                    </p>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-sm font-medium text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">
                                Posta Magica (Email)
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600/50 focus:border-transparent text-slate-100 placeholder-slate-600 transition-all font-sans"
                                placeholder="avventuriero@gilda.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">
                                Parola d'Ordine (Password)
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-600/50 focus:border-transparent text-slate-100 placeholder-slate-600 transition-all font-sans"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:from-amber-700 active:to-amber-800 text-amber-50 font-bold py-3 px-4 rounded-lg shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide flex justify-center items-center"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            isLogin ? "Firma il registro" : "Crea la tua leggenda"
                        )}
                    </button>
                </form>

                <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-700/50"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-500 text-xs uppercase font-bold tracking-wider">oppure</span>
                    <div className="flex-grow border-t border-slate-700/50"></div>
                </div>

                <button
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 font-semibold border border-slate-600 hover:border-slate-500 py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Accedi con il Tomo di Google
                </button>

                <div className="text-center pt-2">
                    <p className="text-sm text-slate-400">
                        {isLogin ? "Nuovo viaggiatore?" : "Già conosciuto in questa taverna?"}{" "}
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-amber-500 hover:text-amber-400 font-semibold hover:underline"
                        >
                            {isLogin ? "Registrati" : "Accedi"}
                        </button>
                    </p>
                </div>

            </div>
        </div>
    );
}
