"use client";
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Connection to your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FlashcardApp() {
  const [cards, setCards] = useState<Array<{front: string, back: string}>>([{ front: '', back: '' }]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCard, setNewCard] = useState({ front: '', back: '' });
  const [copySuccess, setCopySuccess] = useState(false);
  const addCardRef = useRef<HTMLDivElement>(null);

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
    const { data, error } = await supabase
      .from('flashcard_sessions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching session:', error);
      return;
    }
    
    if (data) {
      setCards(data.cards);
      setCurrentIndex(data.current_index);
      setIsLive(data.is_live);
    }
  };

  // Real-time listener: This syncs ALL changes across all users when live sync is enabled
  useEffect(() => {
    if (!sessionId) return;
    
    const channel = supabase
      .channel(`session-changes-${sessionId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'flashcard_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: any) => {
          console.log('Real-time update received:', payload);
          
          // Only update if live sync is enabled
          if (payload.new.is_live) {
            setCards(payload.new.cards);
            setCurrentIndex(payload.new.current_index);
            setShowBack(false); // Reset card flip when syncing
          }
          
          // Always update the live status
          setIsLive(payload.new.is_live);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to real-time updates');
        }
      });
    
    return () => {
      console.log('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const createSession = async () => {
    // Filter out any blank cards before creating session
    const validCards = cards.filter(card => card.front.trim() && card.back.trim());
    
    const { data, error } = await supabase
      .from('flashcard_sessions')
      .insert([{ 
        cards: validCards, 
        is_live: false,
        current_index: 0 
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating session:', error);
      return;
    }
    
    if (data) {
      const newUrl = `${window.location.origin}${window.location.pathname}?session=${data.id}`;
      window.history.pushState({}, '', newUrl);
      setSessionId(data.id);
      setCards(validCards);
      setIsLive(false);
    }
  };

  const handleNext = async () => {
    const nextIdx = (currentIndex + 1) % cards.length;
    setCurrentIndex(nextIdx);
    setShowBack(false);
    
    // Only update database if live sync is enabled
    if (sessionId && isLive) {
      const { error } = await supabase
        .from('flashcard_sessions')
        .update({ current_index: nextIdx })
        .eq('id', sessionId);
      
      if (error) {
        console.error('Error updating index:', error);
      }
    }
  };

  const handlePrevious = async () => {
    const prevIdx = (currentIndex - 1 + cards.length) % cards.length;
    setCurrentIndex(prevIdx);
    setShowBack(false);
    
    // Only update database if live sync is enabled
    if (sessionId && isLive) {
      const { error } = await supabase
        .from('flashcard_sessions')
        .update({ current_index: prevIdx })
        .eq('id', sessionId);
      
      if (error) {
        console.error('Error updating index:', error);
      }
    }
  };

  const toggleLive = async () => {
    const nextLiveState = !isLive;
    setIsLive(nextLiveState);
    
    if (sessionId) {
      const { error } = await supabase
        .from('flashcard_sessions')
        .update({ 
          is_live: nextLiveState,
          current_index: currentIndex // Sync current position when enabling
        })
        .eq('id', sessionId);
      
      if (error) {
        console.error('Error toggling live sync:', error);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAddNewCard = async () => {
    if (newCard.front.trim() && newCard.back.trim()) {
      const updatedCards = [...cards, newCard];
      setCards(updatedCards);
      
      // Update database (works regardless of live sync for adding cards)
      if (sessionId) {
        const { error } = await supabase
          .from('flashcard_sessions')
          .update({ cards: updatedCards })
          .eq('id', sessionId);
        
        if (error) {
          console.error('Error adding card:', error);
        }
      }
      
      setNewCard({ front: '', back: '' });
      setShowAddCard(false);
    }
  };

  const handleShowAddCard = () => {
    setShowAddCard(true);
    setTimeout(() => {
      addCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleAddCardInCreation = () => {
    const validCards = cards.filter(card => card.front.trim() && card.back.trim());
    setCards([...validCards, { front: '', back: '' }]);
    setTimeout(() => {
      const lastCard = document.querySelector(`[data-card-index="${validCards.length}"]`);
      lastCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const hasValidCards = cards.some(card => card.front.trim() && card.back.trim());

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-gray-900">
      {/* Font Definitions */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri&family=Libre+Baskerville&family=Noto+Serif+Bengali&display=swap');
        .custom-font-stack {
          font-family: 'Amiri', 'Noto Serif Bengali', 'Libre Baskerville', serif;
        }
      `}</style>

      <div className="max-w-3xl w-full mx-auto">
        {!sessionId ? (
          <div className="space-y-6 bg-white p-8 rounded-2xl shadow-sm border">
            <h1 className="text-2xl font-bold border-b pb-4 text-center">Create Flashcards</h1>
            {cards.map((card, i) => (
              <div key={i} className="space-y-2" data-card-index={i}>
                <div className="text-sm font-semibold text-gray-600">Card {i + 1}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            ))}
            <div className="flex gap-4 items-center">
              <button onClick={handleAddCardInCreation} className="text-blue-600 font-medium">+ Add Card</button>
              <button 
                onClick={createSession} 
                disabled={!hasValidCards}
                className={`px-6 py-2 rounded-lg ml-auto transition ${hasValidCards ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                Launch
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8 text-center">
            <div className="flex flex-wrap justify-center items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
               <button 
                onClick={toggleLive}
                className={`px-4 py-2 rounded-full font-bold transition ${isLive ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}
               >
                {isLive ? '● Live Sync Active' : '○ Enable Live Sync'}
               </button>
               <button 
                onClick={handleCopyLink}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium"
               >
                {copySuccess ? 'Link Copied' : 'Share'}
               </button>
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

            <div className="space-y-4">
              <div className="flex justify-center items-center gap-4">
                <button onClick={handlePrevious} className="px-8 py-4 bg-black text-white rounded-2xl text-xl font-bold hover:bg-gray-800">← Previous Card</button>
                <button onClick={handleNext} className="px-8 py-4 bg-black text-white rounded-2xl text-xl font-bold hover:bg-gray-800">Next Card →</button>
              </div>
              <div className="flex justify-center">
                <button 
                  onClick={handleShowAddCard} 
                  className="px-6 py-4 bg-green-600 text-white rounded-2xl text-lg font-bold hover:bg-green-700"
                >
                  Add Flashcard
                </button>
              </div>
            </div>

            {showAddCard && (
              <div ref={addCardRef} className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                <h3 className="font-bold text-lg">Add New Card</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input 
                    className="p-3 border rounded-lg custom-font-stack text-lg" 
                    placeholder="Front side..."
                    value={newCard.front}
                    onChange={(e) => setNewCard({ ...newCard, front: e.target.value })}
                  />
                  <input 
                    className="p-3 border rounded-lg custom-font-stack text-lg" 
                    placeholder="Back side..."
                    value={newCard.back}
                    onChange={(e) => setNewCard({ ...newCard, back: e.target.value })}
                  />
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={handleAddNewCard}
                    disabled={!newCard.front.trim() || !newCard.back.trim()}
                    className={`flex-1 py-3 rounded-lg font-bold ${newCard.front.trim() && newCard.back.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                  >
                    Add
                  </button>
                  <button 
                    onClick={() => setShowAddCard(false)}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <p className="text-gray-400 font-serif italic">Card {currentIndex + 1} of {cards.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
