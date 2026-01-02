"use client";
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// Connection to your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FlashcardApp() {
  const [cards, setCards] = useState([{ front: '', back: '' }]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [showBack, setShowBack] = useState(false);

  // Load session from URL if it exists
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('session');
    if (id) {
      setSessionId(id);
      fetchSession(id);
    }
  }, []);

  const fetchSession = async (id: string) => {
    const { data } = await supabase.from('flashcard_sessions').select('*').eq('id', id).single();
    if (data) {
      setCards(data.cards);
      setCurrentIndex(data.current_index);
      setIsLive(data.is_live);
    }
  };

  // Real-time listener: This is the "Live Update" magic
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`sync-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'flashcard_sessions', filter: `id=eq.${sessionId}` }, 
      (payload) => {
        if (payload.new.is_live) {
          setCurrentIndex(payload.new.current_index);
          setIsLive(true);
        } else {
          setIsLive(false);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const createSession = async () => {
    const { data } = await supabase.from('flashcard_sessions').insert([{ cards, is_live: false }]).select().single();
    if (data) {
      const newUrl = `${window.location.origin}?session=${data.id}`;
      window.history.pushState({}, '', newUrl);
      setSessionId(data.id);
    }
  };

  const handleNext = async () => {
    const nextIdx = (currentIndex + 1) % cards.length;
    setCurrentIndex(nextIdx);
    setShowBack(false);
    if (isLive) {
      await supabase.from('flashcard_sessions').update({ current_index: nextIdx }).eq('id', sessionId);
    }
  };

  const toggleLive = async () => {
    const nextLiveState = !isLive;
    setIsLive(nextLiveState);
    await supabase.from('flashcard_sessions').update({ is_live: nextLiveState }).eq('id', sessionId);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-10 text-gray-900">
      {/* Font Definitions */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri&family=Libre+Baskerville&family=Noto+Serif+Bengali&display=swap');
        .custom-font-stack {
          font-family: 'Amiri', 'Noto Serif Bengali', 'Libre Baskerville', serif;
        }
      `}</style>

      <div className="max-w-3xl mx-auto">
        {!sessionId ? (
          <div className="space-y-6 bg-white p-8 rounded-2xl shadow-sm border">
            <h1 className="text-2xl font-bold border-b pb-4">Create Flashcards</h1>
            {cards.map((card, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  className="p-3 border rounded-lg custom-font-stack text-lg" 
                  placeholder="Front side..."
                  value={card.front}
                  onChange={(e) => {
                    const c = [...cards]; c[i].front = e.target.value; setCards(c);
                  }}
                />
                <input 
                  className="p-3 border rounded-lg custom-font-stack text-lg" 
                  placeholder="Back side..."
                  value={card.back}
                  onChange={(e) => {
                    const c = [...cards]; c[i].back = e.target.value; setCards(c);
                  }}
                />
              </div>
            ))}
            <div className="flex gap-4">
              <button onClick={() => setCards([...cards, { front: '', back: '' }])} className="text-blue-600 font-medium">+ Add Card</button>
              <button onClick={createSession} className="bg-blue-600 text-white px-6 py-2 rounded-lg ml-auto hover:bg-blue-700">Launch & Share</button>
            </div>
          </div>
        ) : (
          <div className="space-y-8 text-center">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
               <button 
                onClick={toggleLive}
                className={`px-4 py-2 rounded-full font-bold transition ${isLive ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}
               >
                {isLive ? '● Live Sync Active' : '○ Enable Live Sync'}
               </button>
               <div className="text-sm text-gray-400 select-all">Share Link: {window.location.href}</div>
            </div>

            <div 
              onClick={() => setShowBack(!showBack)}
              className="h-80 w-full bg-white rounded-3xl shadow-xl border-b-8 border-blue-500 flex flex-col items-center justify-center p-10 cursor-pointer transition-transform active:scale-95"
            >
              <span className="text-gray-400 text-xs mb-4 uppercase tracking-widest">{showBack ? 'Back' : 'Front'}</span>
              <h2 className="text-5xl custom-font-stack leading-relaxed">
                {showBack ? cards[currentIndex].back : cards[currentIndex].front}
              </h2>
            </div>

            <div className="flex justify-between items-center max-w-xs mx-auto">
              <button onClick={handleNext} className="w-full py-4 bg-black text-white rounded-2xl text-xl font-bold hover:bg-gray-800">Next Card →</button>
            </div>
            <p className="text-gray-400 font-serif italic">Card {currentIndex + 1} of {cards.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
