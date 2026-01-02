"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* Supabase setup */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FlashcardApp() {
  const [cards, setCards] = useState([{ front: "", back: "" }]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [showBack, setShowBack] = useState(false);

  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [copied, setCopied] = useState(false);

  /* Load session from URL */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");
    if (id) {
      setSessionId(id);
      fetchSession(id);
    }
  }, []);

  const fetchSession = async (id: string) => {
    const { data } = await supabase
      .from("flashcard_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setCards(data.cards);
      setCurrentIndex(data.current_index);
      setIsLive(data.is_live);
    }
  };

  /* Realtime sync */
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`sync-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "flashcard_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setCards(payload.new.cards);
          setCurrentIndex(payload.new.current_index);
          setIsLive(payload.new.is_live);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const createSession = async () => {
    const { data } = await supabase
      .from("flashcard_sessions")
      .insert([{ cards, current_index: 0, is_live: false }])
      .select()
      .single();

    if (data) {
      const url = `${window.location.origin}?session=${data.id}`;
      window.history.pushState({}, "", url);
      setSessionId(data.id);
    }
  };

  const handleNext = async () => {
    const next = (currentIndex + 1) % cards.length;
    setCurrentIndex(next);
    setShowBack(false);

    if (isLive && sessionId) {
      await supabase
        .from("flashcard_sessions")
        .update({ current_index: next })
        .eq("id", sessionId);
    }
  };

  const toggleLive = async () => {
    const next = !isLive;
    setIsLive(next);

    if (sessionId) {
      await supabase
        .from("flashcard_sessions")
        .update({ is_live: next })
        .eq("id", sessionId);
    }
  };

  const addCardLive = async () => {
    if (!newFront || !newBack || !sessionId) return;

    const updated = [...cards, { front: newFront, back: newBack }];
    setCards(updated);
    setNewFront("");
    setNewBack("");

    await supabase
      .from("flashcard_sessions")
      .update({ cards: updated })
      .eq("id", sessionId);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      {/* Fonts */}
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Amiri&family=Libre+Baskerville&family=Noto+Serif+Bengali&display=swap");
        .custom-font {
          font-family: "Amiri", "Noto Serif Bengali", "Libre Baskerville", serif;
        }
      `}</style>

      {/* CENTERED APP CONTAINER */}
      <section className="w-full max-w-md flex flex-col items-center justify-center gap-5 text-gray-900">
        {!sessionId ? (
          <div className="w-full bg-white p-6 rounded-xl border space-y-4">
            <h1 className="text-xl font-bold text-center">
              Create Flashcards
            </h1>

            {cards.map((card, i) => (
              <div key={i} className="space-y-2">
                <input
                  className="w-full p-2 border rounded-lg custom-font"
                  placeholder="Front"
                  value={card.front}
                  onChange={(e) => {
                    const c = [...cards];
                    c[i].front = e.target.value;
                    setCards(c);
                  }}
                />
                <input
                  className="w-full p-2 border rounded-lg custom-font"
                  placeholder="Back"
                  value={card.back}
                  onChange={(e) => {
                    const c = [...cards];
                    c[i].back = e.target.value;
                    setCards(c);
                  }}
                />
              </div>
            ))}

            <button
              onClick={() => setCards([...cards, { front: "", back: "" }])}
              className="text-blue-600 text-sm block mx-auto"
            >
              + Add Card
            </button>

            <button
              onClick={createSession}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold"
            >
              Launch & Share
            </button>
          </div>
        ) : (
          <>
            <div className="w-full flex justify-center gap-3 bg-white p-3 rounded-lg border">
              <button
                onClick={toggleLive}
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  isLive
                    ? "bg-red-100 text-red-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {isLive ? "● Live" : "○ Enable Live"}
              </button>

              <button
                onClick={copyLink}
                className="text-sm bg-gray-100 px-3 py-1 rounded-full"
              >
                {copied ? "✓ Link Copied" : "Copy Live Link"}
              </button>
            </div>

            {isLive && (
              <div className="w-full bg-white p-4 rounded-xl border space-y-2">
                <input
                  className="w-full p-2 border rounded-lg custom-font"
                  placeholder="New front"
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                />
                <input
                  className="w-full p-2 border rounded-lg custom-font"
                  placeholder="New back"
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                />
                <button
                  onClick={addCardLive}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold"
                >
                  + Add Card Live
                </button>
              </div>
            )}

            <div
              onClick={() => setShowBack(!showBack)}
              className="w-full min-h-[50vh] bg-white rounded-2xl border flex items-center justify-center p-6 text-center cursor-pointer"
            >
              <h2 className="text-2xl md:text-4xl custom-font leading-relaxed">
                {showBack
                  ? cards[currentIndex]?.back
                  : cards[currentIndex]?.front}
              </h2>
            </div>

            <button
              onClick={handleNext}
              className="w-full bg-black text-white py-3 rounded-xl text-lg font-bold"
            >
              Next →
            </button>

            <p className="text-center text-gray-400 text-sm">
              Card {currentIndex + 1} of {cards.length}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
