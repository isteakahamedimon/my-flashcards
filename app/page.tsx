"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Copy, Plus, Check, Settings2, ArrowLeft, ArrowRight } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FlashcardApp() {
  const [cards, setCards] = useState([{ front: '', back: '' }]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`sync-${sessionId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'flashcard_sessions', 
        filter: `id=eq.${sessionId}` 
      }, (payload) => {
        setCards(payload.new.cards); // Update cards list if creator added more
        if (payload.new.is_live) {
          setCurrentIndex(payload.new.current_index);
          setIsLive(true);
        } else {
          setIsLive(false);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const saveAndSync = async (updatedCards = cards) => {
    if (sessionId) {
      await supabase.from('flashcard_sessions').update({ cards: updatedCards }).eq('id', sessionId);
    }
  };

  const createSession = async () => {
    const { data } = await supabase.from('flashcard_sessions').insert([{ cards, is_live: false }]).select().single();
    if (data) {
      const newUrl = `${window.location.origin}?session=${data.id}`;
      window.history.pushState({}, '', newUrl);
      setSessionId(data.id);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCardChange = async (index: number) => {
    setCurrentIndex(index);
    setShowBack(false);
    if (isLive && sessionId) {
      await supabase.from('flashcard_sessions').update({ current_index: index }).eq('id', sessionId);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col items-center justify-center p-4">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri&family=Libre+Baskerville&family=Noto+Serif+Bengali&display=swap');
        .mix-font { font-family: 'Amiri', 'Noto Serif Bengali', 'Libre Baskerville', serif; }
      `}</style>

      <div className="w-full max-w-md">
        {!sessionId || isEditing ? (
          <div className="space-y-6">
            <h1 className="text-xl font-bold text-center mb-8">Manage Vocabulary</h1>
            {cards.map((card, i) => (
              <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl">
                <input 
                  className="bg-transparent border-none focus:ring-0 p-1 mix-font text-lg" 
                  placeholder="Front Side"
                  value={card.front}
                  onChange={(e) => { const c = [...cards]; c[i].front = e.target.value; setCards(c); }}
                />
                <hr className="border-slate-200" />
                <input 
                  className="bg-transparent border-none focus:ring-0 p-1 mix-font text-lg text-blue-600" 
                  placeholder="Back Side"
                  value={card.back}
                  onChange={(e) => { const c = [...cards]; c[i].back = e.target.value; setCards(c); }}
                />
              </div>
            ))}
            <button onClick={() => setCards([...cards, { front: '', back: '' }])} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 flex items-center justify-center gap-2">
              <Plus size={18} /> Add Word
            </button>
            
            {sessionId ? (
              <button onClick={() => { setIsEditing(false); saveAndSync(); }} className="w-full py-4 bg-black text-white rounded-2xl font-bold">Save Changes</button>
            ) : (
              <button onClick={createSession} className="w-full py-4 bg-black text-white rounded-2xl font-bold">Create Live Session</button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header Controls */}
            <div className="flex justify-between items-center gap-2">
              <button onClick={copyLink} className="flex-1 py-2 px-4 bg-slate-100 rounded-full text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95">
                {isCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                {isCopied ? 'COPIED!' : 'COPY LINK'}
              </button>
              <button 
                onClick={async () => {
                  const s = !isLive; setIsLive(s);
                  await supabase.from('flashcard_sessions').update({ is_live: s, current_index: currentIndex }).eq('id', sessionId);
                }}
                className={`flex-1 py-2 px-4 rounded-full text-xs font-bold transition active:scale-95 ${isLive ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}
              >
                {isLive ? 'LIVE: ON' : 'LIVE: OFF'}
              </button>
              <button onClick={() => setIsEditing(true)} className="p-2 bg-slate-100 rounded-full"><Settings2 size={16} /></button>
            </div>

            {/* Flashcard */}
            <div 
              onClick={() => setShowBack(!showBack)}
              className="aspect-[3/4] w-full bg-white rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 flex flex-col items-center justify-center p-8 cursor-pointer transition-all active:scale-95"
            >
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em] mb-auto">{showBack ? 'Answer' : 'Word'}</span>
              <h2 className="text-4xl md:text-5xl mix-font text-center leading-relaxed mb-auto">
                {showBack ? cards[currentIndex].back : cards[currentIndex].front}
              </h2>
              <p className="mt-auto text-[10px] text-slate-300 font-bold">{currentIndex + 1} / {cards.length}</p>
            </div>

            {/* Navigation */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => handleCardChange((currentIndex - 1 + cards.length) % cards.length)}
                className="py-5 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 hover:text-black transition"
              >
                <ArrowLeft size={24} />
              </button>
              <button 
                onClick={() => handleCardChange((currentIndex + 1) % cards.length)}
                className="py-5 bg-slate-900 text-white rounded-3xl flex items-center justify-center transition"
              >
                <ArrowRight size={24} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
