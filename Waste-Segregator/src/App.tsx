import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import './App.css';

// --- GAME DATA ---
type Category = 'recyclable' | 'e-waste' | 'normal';
interface WasteItem { id: string; name: string; category: Category; emoji: string; }

const ALL_ITEMS: WasteItem[] = [
  { id: '1', name: "Plastic Bottle", category: "recyclable", emoji: "🚰" },
  { id: '4', name: "Cardboard Box", category: "recyclable", emoji: "📦" },
  { id: '2', name: "Old Smartphone", category: "e-waste", emoji: "📱" },
  { id: '5', name: "Broken Laptop", category: "e-waste", emoji: "💻" },
  { id: '3', name: "Banana Peel", category: "normal", emoji: "🍌" },
  { id: '16', name: "Greasy Pizza Box", category: "normal", emoji: "🍕" },
  { id: '17', name: "Store Receipt", category: "normal", emoji: "🧾" },
  { id: '18', name: "Paper Coffee Cup", category: "normal", emoji: "☕" },
  { id: '19', name: "Clean Tinfoil", category: "recyclable", emoji: "🌯" },
  { id: '20', name: "Dead LED Bulb", category: "e-waste", emoji: "💡" },
  { id: '21', name: "Tangled Earphones", category: "e-waste", emoji: "🎧" }, 
  { id: '22', name: "Empty Toothpaste", category: "normal", emoji: "🪥" },
];

// --- COMPONENTS ---
function DraggableItem({ item }: { item: WasteItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: item });
  const style = transform 
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.05 : 1})` } 
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-item">
      <span className="item-emoji">{item.emoji}</span>
      <p>{item.name}</p>
    </div>
  );
}

function DroppableBin({ id, title, emoji }: { id: Category; title: string; emoji: string }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const style = { 
    backgroundColor: isOver ? 'rgba(212, 175, 55, 0.15)' : 'var(--bhoomi-card)',
    borderColor: isOver ? 'var(--bhoomi-primary)' : 'rgba(44, 64, 53, 0.5)',
    transform: isOver ? 'scale(1.03)' : 'scale(1)'
  };

  return (
    <div ref={setNodeRef} style={style} className={`bin bin-${id}`}>
      <span className="bin-emoji">{emoji}</span>
      <h4>{title}</h4>
    </div>
  );
}

// --- ANIMATION VARIANTS ---
const pageVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }
};

// --- MAIN APP ---
export default function App() {
  const [gameState, setGameState] = useState<'login' | 'playing' | 'review' | 'leaderboard'>('login');
  const [name, setName] = useState('');
  const [score, setScore] = useState(0);
  const [bonusPoints, setBonusPoints] = useState(0); 
  const [queue, setQueue] = useState<WasteItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [history, setHistory] = useState<{ item: WasteItem, droppedIn: Category, isCorrect: boolean }[]>([]);
  const [timeLeft, setTimeLeft] = useState(45);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    } else if (gameState === 'playing' && timeLeft === 0) {
      endRound(score, 0); 
    }
  }, [timeLeft, gameState]);

  const startGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    const shuffled = [...ALL_ITEMS].sort(() => 0.5 - Math.random()).slice(0, 10);
    setQueue(shuffled);
    setScore(0);
    setBonusPoints(0);
    setTimeLeft(45);
    setHistory([]);
    setGameState('playing');
  };

  const endRound = async (finalBaseScore: number, remainingTime: number) => {
    const earnedBonus = finalBaseScore === 100 ? remainingTime : 0;
    const totalScore = finalBaseScore + earnedBonus;
    
    setBonusPoints(earnedBonus);
    setScore(totalScore); 
    
    await supabase.from('leaderboard').insert([{ name, score: totalScore }]);
    setGameState('review');
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return; 

    const draggedItem = active.data.current as WasteItem;
    const targetBin = over.id as Category;
    const isCorrect = draggedItem.category === targetBin;

    let currentScore = score;
    if (isCorrect) currentScore += 10;
    setScore(currentScore);

    setHistory(prev => [...prev, { item: draggedItem, droppedIn: targetBin, isCorrect }]);

    const nextQueue = queue.slice(1);
    setQueue(nextQueue);

    if (nextQueue.length === 0) {
      endRound(currentScore, timeLeft); 
    }
  };

  const showLeaderboard = async () => {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .limit(10);
    if (!error && data) setLeaderboard(data);
    setGameState('leaderboard');
  };

  return (
    <div className="container">
      <AnimatePresence mode="wait">
        {gameState === 'login' && (
          <motion.div key="login" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="card-wrapper">
            <form onSubmit={startGame} className="card">
              <span className="brand-subtitle">Bhoomi House</span>
              <h1>Eco Sort</h1>
              <p>Sort 10 items before the 45-second timer runs out!</p>
              <input 
                type="text" 
                placeholder="Enter your name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
              <button type="submit">Begin Session</button>
            </form>
          </motion.div>
        )}

        {gameState === 'playing' && queue.length > 0 && (
          <motion.div key="playing" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="game-board">
            <div className="score-board">
              <h2 style={{ color: timeLeft <= 10 ? '#EF4444' : 'var(--bhoomi-text-dark)' }}>
                ⏱️ {timeLeft}s
              </h2>
              <p>Items remaining: {queue.length}</p>
            </div>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="item-stage">
                <DraggableItem item={queue[0]} />
              </div>
              <div className="bins-container">
                <DroppableBin id="recyclable" title="Recycle" emoji="♻️" />
                <DroppableBin id="e-waste" title="E-Waste" emoji="🔋" />
                <DroppableBin id="normal" title="Trash" emoji="🗑️" />
              </div>
            </DndContext>
          </motion.div>
        )}

        {gameState === 'review' && (
          <motion.div key="review" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="card-wrapper">
            <div className="card">
              <span className="brand-subtitle">Analysis Complete</span>
              <h2>Review Performance</h2>
              <p>Base Score: {score - bonusPoints}</p>
              {bonusPoints > 0 && (
                <p style={{ color: 'var(--bhoomi-primary)', fontWeight: 'bold' }}>
                  Perfect Round! Time Bonus: +{bonusPoints}
                </p>
              )}
              <h3 style={{ fontSize: '28px', margin: '15px 0' }}>Total Score: <strong>{score}</strong></h3>
              <ul className="review-list">
                {history.map((record, index) => (
                  <li key={index} className={record.isCorrect ? 'correct-ans' : 'wrong-ans'}>
                    <div>
                      <span className="review-emoji">{record.item.emoji}</span>
                      <strong>{record.item.name}</strong> 
                    </div>
                    <div style={{ fontWeight: 'bold', color: record.isCorrect ? 'var(--bhoomi-primary)' : '#EF4444' }}>
                      {record.isCorrect ? 'Correct' : 'Incorrect'}
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={showLeaderboard}>View Rankings</button>
            </div>
          </motion.div>
        )}

        {gameState === 'leaderboard' && (
          <motion.div key="leaderboard" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="card-wrapper">
            <div className="card">
              <span className="brand-subtitle">Bhoomi House</span>
              <h2>Top Sorters</h2>
              <ul className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <li key={entry.id}>
                    <span><strong>#{index + 1}</strong> {entry.name}</span>
                    <span style={{ color: 'var(--bhoomi-primary)', fontWeight: 'bold' }}>{entry.score} pts</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => setGameState('login')}>New Session</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}