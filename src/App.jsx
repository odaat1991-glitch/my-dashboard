import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX,
  CheckSquare, Plus, X, Trash2, Save,
  Code, FileText, Activity, Layout,
  ChevronRight, ChevronLeft, GripVertical,
  LogOut, User, Trophy, Flame, Target,
  Calendar, Download, Upload, Music, Sliders,
  Headphones, Radio, CloudRain, Maximize2, LogIn, Zap, Clock, Home, Moon, Power
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION ---
// We are hardcoding these to ensure they work on GitHub Pages
const firebaseConfig = {
  apiKey: "AIzaSyARypVAjLuFlXSuqU-tYNj2L-dLgLq2H74",
  authDomain: "productivity-git.firebaseapp.com",
  projectId: "productivity-git",
  storageBucket: "productivity-git.firebasestorage.app",
  messagingSenderId: "874339373522",
  appId: "1:874339373522:web:939bfa39737dc81fcd380b",
  measurementId: "G-RWZJGDK0V9"
};

// Sanitize appId to prevent path segment errors
const appId = (firebaseConfig.appId || 'default-app').replace(/[^a-zA-Z0-9_-]/g, '_');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UTILITIES ---

// Sound Utility for Pomodoro
const playNotificationSound = (volume = 0.5, type = 'complete') => {
  if (volume <= 0) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'complete') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(659.25, ctx.currentTime + 0.1);
      osc.frequency.linearRampToValueAtTime(783.99, ctx.currentTime + 0.2);
      osc.frequency.linearRampToValueAtTime(1046.50, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

// Ambient Noise Generator Class (Web Audio API)
class AmbientGenerator {
  constructor() {
    this.ctx = null;
    this.nodes = {};
    this.intervals = {};
    this.volumes = {};
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
  }

  createNoise(type) {
    if (!this.ctx) this.init();
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'white') {
        output[i] = white;
      } else if (type === 'pink') {
        const b = [0, 0, 0, 0, 0, 0, 0];
        b[0] = 0.99886 * b[0] + white * 0.0555179;
        b[1] = 0.99332 * b[1] + white * 0.0750759;
        b[2] = 0.96900 * b[2] + white * 0.1538520;
        b[3] = 0.86650 * b[3] + white * 0.3104856;
        b[4] = 0.55000 * b[4] + white * 0.5329522;
        b[5] = -0.7616 * b[5] - white * 0.0168980;
        output[i] = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + white * 0.5362;
        output[i] *= 0.11;
      } else if (type === 'brown') {
        const lastOut = i > 0 ? output[i - 1] : 0;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        output[i] *= 3.5;
      }
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
  }

  playChime(volume) {
    if (!this.ctx || volume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const freqs = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00];
    const freq = freqs[Math.floor(Math.random() * freqs.length)];
    osc.frequency.value = freq;
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    osc.start(now);
    osc.stop(now + 3.5);
    setTimeout(() => { osc.disconnect(); gain.disconnect(); }, 4000);
  }

  toggle(type, volume) {
    this.volumes[type] = volume;
    if (type === 'chimes') {
      if (this.intervals.chimes) {
        clearInterval(this.intervals.chimes);
        delete this.intervals.chimes;
      }
      if (volume > 0) {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.intervals.chimes = setInterval(() => {
          if (Math.random() < 0.3) this.playChime(this.volumes.chimes);
        }, 2000);
        this.playChime(volume);
      }
      return;
    }
    if (this.nodes[type]) {
      try { this.nodes[type].source.stop(); this.nodes[type].gain.disconnect(); } catch (e) { }
      delete this.nodes[type];
    }
    if (volume > 0) {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const source = this.createNoise(type);
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start();
      this.nodes[type] = { source, gain };
    }
  }

  setVolume(type, volume) {
    this.volumes[type] = volume;
    if (type === 'chimes') {
      if (volume <= 0 && this.intervals.chimes) {
        clearInterval(this.intervals.chimes);
        delete this.intervals.chimes;
      } else if (volume > 0 && !this.intervals.chimes) {
        this.toggle('chimes', volume);
      }
      return;
    }
    if (this.nodes[type]) {
      this.nodes[type].gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.1);
    } else if (volume > 0) {
      this.toggle(type, volume);
    }
  }

  stopAll() {
    Object.keys(this.nodes).forEach(type => { try { this.nodes[type].source.stop(); } catch (e) { } });
    Object.keys(this.intervals).forEach(type => { clearInterval(this.intervals[type]); });
    this.nodes = {};
    this.intervals = {};
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}

const ambientGen = new AmbientGenerator();

// Confetti Component
const Confetti = ({ isActive }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        size: Math.random() * 8 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.5,
        drag: 0.96,
        life: 100
      });
    }
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let activeParticles = false;
      particles.forEach(p => {
        if (p.life > 0) {
          activeParticles = true;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.vx *= p.drag;
          p.vy *= p.drag;
          p.life--;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      if (activeParticles) requestAnimationFrame(animate);
    };
    animate();
  }, [isActive]);
  if (!isActive) return null;
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />;
};

// --- COMPONENTS ---

const MiniTimer = ({ timeLeft, isActive, mode, toggleTimer, onExpand }) => {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  return (
    <div className="fixed bottom-6 right-6 bg-white p-3 pr-5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 flex items-center gap-4 z-50 animate-bounce-in">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${mode === 'work' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'}`}
        onClick={toggleTimer}
      >
        {isActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </div>
      <div className="flex flex-col cursor-pointer" onClick={onExpand}>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{mode}</span>
        <span className="text-xl font-mono font-bold text-slate-700 leading-none">{formatTime(timeLeft)}</span>
      </div>
      <button onClick={onExpand} className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">
        <Maximize2 size={16} />
      </button>
    </div>
  );
};

const Pomodoro = ({ timeLeft, isActive, mode, toggleTimer, resetTimer, switchMode, volume, setVolume, dailyCount }) => {
  const WORK_TIME = 25 * 60;
  const BREAK_TIME = 5 * 60;
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const totalTime = mode === 'work' ? WORK_TIME : BREAK_TIME;
  const progress = ((totalTime - timeLeft) / totalTime) * 100;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-3xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex flex-col items-center relative overflow-hidden">
          <div className="flex space-x-2 bg-slate-50 p-1.5 rounded-xl mb-8 relative z-10">
            <button onClick={() => switchMode('work')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${mode === 'work' ? 'bg-white text-indigo-600 shadow-sm scale-105' : 'text-slate-400 hover:text-slate-600'}`}>Deep Work</button>
            <button onClick={() => switchMode('break')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${mode === 'break' ? 'bg-white text-teal-600 shadow-sm scale-105' : 'text-slate-400 hover:text-slate-600'}`}>Rest</button>
          </div>
          <div className="relative mb-8 group cursor-default">
            <svg className="transform -rotate-90 w-80 h-80">
              <circle cx="160" cy="160" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-50" />
              <circle cx="160" cy="160" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className={`transition-all duration-1000 ease-linear ${mode === 'work' ? 'text-indigo-500' : 'text-teal-500'}`} />
            </svg>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
              <div className={`text-6xl font-mono font-bold tracking-tighter ${mode === 'work' ? 'text-indigo-900' : 'text-teal-900'}`}>{formatTime(timeLeft)}</div>
              <div className="text-slate-400 text-sm font-medium mt-2 tracking-widest uppercase">{isActive ? 'Focusing' : 'Paused'}</div>
            </div>
          </div>
          <div className="flex items-center space-x-6 relative z-10">
            <button onClick={resetTimer} className="p-4 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><RotateCcw size={24} /></button>
            <button onClick={toggleTimer} className={`p-6 rounded-3xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl ${isActive ? 'bg-amber-50 text-amber-500 hover:bg-amber-100 ring-4 ring-amber-50' : mode === 'work' ? 'bg-indigo-600 text-white hover:bg-indigo-700 ring-4 ring-indigo-50' : 'bg-teal-500 text-white hover:bg-teal-600 ring-4 ring-teal-50'}`}>{isActive ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}</button>
          </div>
        </div>
        <div className="flex flex-col space-y-6">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Trophy size={120} /></div>
            <div className="relative z-10">
              <h3 className="text-indigo-100 font-medium mb-1 flex items-center gap-2"><Target size={18} /> Daily Focus</h3>
              <div className="flex items-baseline gap-2"><span className="text-5xl font-bold">{dailyCount}</span><span className="text-indigo-200 text-sm font-medium">sessions</span></div>
              <div className="mt-4 bg-white/20 h-2 rounded-full overflow-hidden backdrop-blur-sm"><div className="h-full bg-white/90 rounded-full transition-all duration-1000" style={{ width: `${Math.min((dailyCount / 8) * 100, 100)}%` }} /></div>
              <p className="text-xs text-indigo-200 mt-2">Goal: 8 sessions / day</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1">
            <h3 className="text-slate-500 font-medium mb-4 flex items-center gap-2"><Volume2 size={18} /> Soundscape</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-slate-400"><VolumeX size={18} /><Volume2 size={18} /></div>
              <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-600" />
              <p className="text-xs text-slate-400 text-center">Adjust notification volume</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KanbanColumn = ({ title, status, tasks, user, onDrop, onDragStart }) => {
  const handleDragOver = (e) => e.preventDefault();
  const borderColor = { 'todo': 'border-blue-500', 'doing': 'border-amber-500', 'done': 'border-emerald-500', 'waiting': 'border-purple-500', 'not-doing': 'border-red-500' }[status] || 'border-slate-300';
  const headerBg = { 'todo': 'bg-blue-50', 'doing': 'bg-amber-50', 'done': 'bg-emerald-50', 'waiting': 'bg-purple-50', 'not-doing': 'bg-red-50' }[status] || 'bg-slate-50';
  const textColor = { 'todo': 'text-blue-700', 'doing': 'text-amber-700', 'done': 'text-emerald-700', 'waiting': 'text-purple-700', 'not-doing': 'text-red-700' }[status] || 'text-slate-700';

  return (
    <div className={`flex-1 bg-slate-50/50 rounded-xl flex flex-col min-h-[500px] border-t-4 ${borderColor} shadow-[0_8px_30px_rgb(0,0,0,0.04)]`} onDragOver={handleDragOver} onDrop={(e) => onDrop(e, status)}>
      <div className={`p-4 rounded-t-sm ${headerBg} flex items-center justify-between border-b border-slate-200/50`}>
        <h3 className={`font-bold ${textColor} uppercase tracking-wide text-sm`}>{title}</h3>
        <span className="bg-white/80 backdrop-blur-sm text-slate-500 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">{tasks.length}</span>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {tasks.map(task => (
          <div key={task.id} draggable onDragStart={(e) => onDragStart(e, task.id)} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-move hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group relative">
            <p className="text-slate-700 font-medium text-sm leading-relaxed">{task.content}</p>
            <div className="flex justify-end mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'kanban', task.id))} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Kanban = ({ user, energyLevel }) => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [newEnergy, setNewEnergy] = useState('medium');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'kanban'));
    return onSnapshot(q, (snapshot) => setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Kanban error", error));
  }, [user]);
  const addTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'kanban'), {
      content: newTask,
      status: 'todo',
      energy: newEnergy,
      createdAt: serverTimestamp()
    });
    setNewTask('');
    setNewEnergy('medium');
  };
  const handleDragStart = (e, id) => e.dataTransfer.setData('taskId', id);
  const handleDrop = async (e, newStatus) => {
    const id = e.dataTransfer.getData('taskId');
    if (id) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'kanban', id), { status: newStatus });
  };

  const filteredTasks = tasks.filter(task => {
    if (energyLevel <= 4 && task.energy === 'high') return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <form onSubmit={addTask} className="flex gap-3">
          <div className="flex-1 relative">
            <Plus size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a new task..." className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-lg border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-700" />
          </div>
          <select
            value={newEnergy}
            onChange={(e) => setNewEnergy(e.target.value)}
            className="px-4 py-2 bg-slate-50 rounded-lg border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600 text-sm font-medium"
          >
            <option value="low">Low Energy</option>
            <option value="medium">Medium Energy</option>
            <option value="high">High Energy</option>
          </select>
          <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-all hover:shadow-md">Add Task</button>
        </form>
      </div>
      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 px-1">
        <KanbanColumn title="To Do" status="todo" tasks={filteredTasks.filter(t => t.status === 'todo')} user={user} onDrop={handleDrop} onDragStart={handleDragStart} />
        <KanbanColumn title="In Progress" status="doing" tasks={filteredTasks.filter(t => t.status === 'doing')} user={user} onDrop={handleDrop} onDragStart={handleDragStart} />
        <KanbanColumn title="Waiting On" status="waiting" tasks={filteredTasks.filter(t => t.status === 'waiting')} user={user} onDrop={handleDrop} onDragStart={handleDragStart} />
        <KanbanColumn title="Done" status="done" tasks={filteredTasks.filter(t => t.status === 'done')} user={user} onDrop={handleDrop} onDragStart={handleDragStart} />
        <KanbanColumn title="Anti-Goal (Not Doing)" status="not-doing" tasks={filteredTasks.filter(t => t.status === 'not-doing')} user={user} onDrop={handleDrop} onDragStart={handleDragStart} />
      </div>
    </div>
  );
};

const Notes = ({ user }) => {
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => setNotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);
  const activeNote = notes.find(n => n.id === activeNoteId) || { title: '', content: '', isCode: false };
  const createNote = async () => {
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), { title: '', content: '', isCode: false, updatedAt: serverTimestamp() });
    setActiveNoteId(ref.id);
  };
  const updateActiveNote = async (field, value) => {
    if (!activeNoteId) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', activeNoteId), { [field]: value, updatedAt: serverTimestamp() });
  };
  const deleteNote = async (id, e) => {
    e.stopPropagation();
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id));
    if (activeNoteId === id) setActiveNoteId(null);
  };
  const handleExport = () => {
    if (!activeNoteId) return;
    const element = document.createElement("a");
    const file = new Blob([activeNote.content], { type: 'text/markdown' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeNote.title || 'untitled'}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  const handleImportClick = () => fileInputRef.current.click();
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      const title = file.name.replace('.md', '').replace('.txt', '');
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), { title, content, isCode: false, updatedAt: serverTimestamp() });
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  return (
    <div className="h-full flex bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2"><FileText size={18} className="text-indigo-500" /> Library</h2>
          <div className="flex gap-1">
            <input type="file" ref={fileInputRef} onChange={handleImportFile} className="hidden" accept=".md,.txt" />
            <button onClick={handleImportClick} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 hover:text-indigo-600 transition-colors" title="Import Markdown"><Upload size={16} /></button>
            <button onClick={createNote} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 hover:text-indigo-600 transition-colors"><Plus size={16} /></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {notes.map(note => (
            <div key={note.id} onClick={() => setActiveNoteId(note.id)} className={`p-3 rounded-lg cursor-pointer group transition-all ${activeNoteId === note.id ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}>
              <div className="flex justify-between items-start">
                <h4 className={`font-medium truncate text-sm ${!note.title ? 'italic opacity-50' : ''}`}>{note.title || 'Untitled Note'}</h4>
                <button onClick={(e) => deleteNote(note.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"><Trash2 size={14} /></button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">{note.isCode ? <Code size={10} /> : <FileText size={10} />}{new Date(note.updatedAt?.seconds * 1000 || Date.now()).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col h-full bg-white">
        {activeNoteId ? (
          <>
            <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex-1 mr-4"><input value={activeNote.title} onChange={(e) => updateActiveNote('title', e.target.value)} className="text-xl font-bold text-slate-800 outline-none w-full bg-transparent placeholder:text-slate-300" placeholder="Untitled Note" /></div>
              <div className="flex items-center gap-2">
                <button onClick={handleExport} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded transition-colors" title="Export to Markdown"><Download size={18} /></button>
                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                <button onClick={() => updateActiveNote('isCode', !activeNote.isCode)} className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold tracking-wide transition-colors ${activeNote.isCode ? 'bg-slate-800 text-green-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{activeNote.isCode ? <><Code size={14} /> CODE</> : <><FileText size={14} /> TEXT</>}</button>
              </div>
            </div>
            <textarea className={`flex-1 w-full p-8 outline-none resize-none leading-relaxed text-base ${activeNote.isCode ? 'font-mono bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-white text-slate-600 selection:bg-indigo-100'}`} value={activeNote.content} onChange={(e) => updateActiveNote('content', e.target.value)} placeholder={activeNote.isCode ? '// Type code snippet here...' : 'Start writing...'} spellCheck={!activeNote.isCode} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4"><FileText size={40} /></div>
            <p className="font-medium">Select a note to view details</p>
          </div>
        )}
      </div>
    </div>
  );
};

const HabitTracker = ({ user }) => {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState('');
  const dates = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'habits'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => setHabits(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);
  const addHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.trim()) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'habits'), { name: newHabit, history: {}, createdAt: serverTimestamp() });
    setNewHabit('');
  };
  const toggleHabitDay = async (habit, dateStr) => {
    const newHistory = { ...habit.history };
    if (newHistory[dateStr]) delete newHistory[dateStr]; else newHistory[dateStr] = true;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'habits', habit.id), { history: newHistory });
  };
  const deleteHabit = async (id) => {
    if (window.confirm('Stop tracking this habit?')) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'habits', id));
  };
  const calculateStreak = (history) => {
    let streak = 0;
    const today = new Date();
    let currentCheck = new Date(today);
    let dateStr = currentCheck.toISOString().split('T')[0];
    if (!history[dateStr]) { currentCheck.setDate(currentCheck.getDate() - 1); dateStr = currentCheck.toISOString().split('T')[0]; if (!history[dateStr]) return 0; }
    while (true) { dateStr = currentCheck.toISOString().split('T')[0]; if (history[dateStr]) { streak++; currentCheck.setDate(currentCheck.getDate() - 1); } else { break; } }
    return streak;
  };
  const calculateWeeklyProgress = (history) => {
    let completed = 0;
    dates.forEach(d => { if (history[d]) completed++; });
    return (completed / 7) * 100;
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><Activity size={24} /></div>
        <form onSubmit={addHabit} className="flex-1 flex gap-2">
          <input type="text" value={newHabit} onChange={e => setNewHabit(e.target.value)} placeholder="What habit do you want to build?" className="flex-1 px-4 py-2 bg-transparent outline-none text-lg text-slate-700 placeholder:text-slate-300" />
          <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded-xl hover:bg-slate-800 font-medium transition-colors">Add Habit</button>
        </form>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="text-left p-6 text-sm font-bold text-slate-400 uppercase tracking-wider w-1/3">Habit</th>
                <th className="text-left p-6 text-sm font-bold text-slate-400 uppercase tracking-wider w-32">Streak</th>
                {dates.map(date => {
                  const d = new Date(date);
                  const isToday = new Date().toDateString() === d.toDateString();
                  return (
                    <th key={date} className="p-4 text-center w-16">
                      <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg ${isToday ? 'bg-indigo-600 text-white shadow-md' : ''}`}>
                        <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-indigo-200' : 'text-slate-400'}`}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-600'}`}>{d.getDate()}</span>
                      </div>
                    </th>
                  )
                })}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {habits.map(habit => {
                const streak = calculateStreak(habit.history);
                const progress = calculateWeeklyProgress(habit.history);
                return (
                  <tr key={habit.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group">
                    <td className="p-6">
                      <div className="font-semibold text-slate-700 text-lg">{habit.name}</div>
                      <div className="flex items-center gap-2 mt-2"><div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} /></div><span className="text-xs text-slate-400">{Math.round(progress)}% weekly</span></div>
                    </td>
                    <td className="p-6">
                      <div className={`flex items-center gap-2 font-bold ${streak > 2 ? 'text-orange-500' : 'text-slate-400'}`}><Flame size={20} className={`${streak > 2 ? 'fill-orange-500 animate-pulse' : ''}`} />{streak} days</div>
                    </td>
                    {dates.map(date => {
                      const isCompleted = habit.history?.[date];
                      return (
                        <td key={date} className="p-2 text-center">
                          <button onClick={() => toggleHabitDay(habit, date)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 scale-105' : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:scale-105'}`}>{isCompleted ? <CheckSquare size={20} /> : <div className="w-3 h-3 rounded-sm bg-slate-300/50" />}</button>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center"><button onClick={() => deleteHabit(habit.id)} className="p-2 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button></td>
                  </tr>
                );
              })}
              {habits.length === 0 && <tr><td colSpan={10} className="p-12 text-center text-slate-400"><Activity size={48} className="mx-auto mb-4 opacity-20" /><p>No habits tracked yet. Start your journey today!</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const FocusSounds = () => {
  const [volumes, setVolumes] = useState({ pink: 0, brown: 0, white: 0, chimes: 0 });
  useEffect(() => { return () => ambientGen.stopAll(); }, []);
  const toggleVolume = (type, val) => {
    const newVolumes = { ...volumes, [type]: val };
    setVolumes(newVolumes);
    ambientGen.setVolume(type, val);
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex flex-col">
        <div className="mb-8"><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Sliders size={24} className="text-indigo-600" /> Ambient Mixer</h2><p className="text-slate-400 mt-2">Mix your own soundscape using generated noise colors.</p></div>
        <div className="space-y-6 flex-1 overflow-y-auto pr-2">
          <div className="bg-slate-50 rounded-2xl p-6"><div className="flex justify-between mb-4"><span className="font-semibold text-slate-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-pink-400"></div> Rain (Pink Noise)</span><span className="text-slate-400 font-mono text-sm">{Math.round(volumes.pink * 100)}%</span></div><input type="range" min="0" max="0.5" step="0.01" value={volumes.pink} onChange={(e) => toggleVolume('pink', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-pink-500" /></div>
          <div className="bg-slate-50 rounded-2xl p-6"><div className="flex justify-between mb-4"><span className="font-semibold text-slate-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-400"></div> Wind Chimes</span><span className="text-slate-400 font-mono text-sm">{Math.round(volumes.chimes * 100)}%</span></div><input type="range" min="0" max="0.5" step="0.01" value={volumes.chimes} onChange={(e) => toggleVolume('chimes', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500" /></div>
          <div className="bg-slate-50 rounded-2xl p-6"><div className="flex justify-between mb-4"><span className="font-semibold text-slate-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-700"></div> River (Brown Noise)</span><span className="text-slate-400 font-mono text-sm">{Math.round(volumes.brown * 100)}%</span></div><input type="range" min="0" max="0.5" step="0.01" value={volumes.brown} onChange={(e) => toggleVolume('brown', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-amber-700" /></div>
          <div className="bg-slate-50 rounded-2xl p-6"><div className="flex justify-between mb-4"><span className="font-semibold text-slate-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-400"></div> Static (White Noise)</span><span className="text-slate-400 font-mono text-sm">{Math.round(volumes.white * 100)}%</span></div><input type="range" min="0" max="0.1" step="0.01" value={volumes.white} onChange={(e) => toggleVolume('white', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-400" /></div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div className="bg-black rounded-3xl shadow-xl overflow-hidden relative group h-[400px] border border-white/10">
          <iframe width="100%" height="100%" scrolling="no" frameBorder="no" allow="autoplay" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent('https://soundcloud.com/chillhopdotcom/sets/lofihiphop')}&color=%236366f1&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true`} className="h-full w-full" title="Chillhop SoundCloud"></iframe>
        </div>
        <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-lg flex-1 flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10"><svg width="100%" height="100%"><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" /></pattern><rect width="100%" height="100%" fill="url(#grid)" /></svg></div>
          <div className="relative z-10"><Headphones size={48} className="mb-4 mx-auto opacity-80" /><h3 className="text-2xl font-bold mb-2">Focus Mode Active</h3><p className="text-indigo-200 max-w-xs mx-auto">Combine the ambient noise on the left with the music above for deep focus.</p></div>
        </div>
      </div>
    </div>
  );
};

const BreathingBox = () => {
  const [phase, setPhase] = useState('inhale'); // inhale, hold-in, exhale, hold-out
  const [text, setText] = useState('Breathe In');

  useEffect(() => {
    let timeout;

    const runCycle = () => {
      // Inhale (4s)
      setPhase('inhale');
      setText('Breathe In');

      timeout = setTimeout(() => {
        // Hold (4s)
        setPhase('hold-in');
        setText('Hold');

        timeout = setTimeout(() => {
          // Exhale (4s)
          setPhase('exhale');
          setText('Breathe Out');

          timeout = setTimeout(() => {
            // Hold (4s)
            setPhase('hold-out');
            setText('Hold');

            timeout = setTimeout(() => {
              runCycle();
            }, 4000);
          }, 4000);
        }, 4000);
      }, 4000);
    };

    runCycle();

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-100 p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 to-blue-50 opacity-50"></div>

      <div className="relative z-10 flex flex-col items-center">
        <h2 className="text-2xl font-bold text-slate-700 mb-12 flex items-center gap-2">
          <CloudRain className="text-cyan-500" /> Box Breathing
        </h2>

        <div className="relative flex items-center justify-center w-80 h-80">
          {/* Outer Guide Circle */}
          <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>

          {/* Animated Circle */}
          <div
            className={`
              w-full h-full rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-xl shadow-cyan-200
              flex items-center justify-center transition-all duration-[4000ms] ease-in-out
              ${phase === 'inhale' ? 'scale-100 opacity-100' : ''}
              ${phase === 'hold-in' ? 'scale-100 opacity-100' : ''}
              ${phase === 'exhale' ? 'scale-50 opacity-80' : ''}
              ${phase === 'hold-out' ? 'scale-50 opacity-80' : ''}
            `}
          >
            <span className="text-4xl font-bold text-white tracking-wider animate-pulse">
              {text}
            </span>
          </div>

          {/* Orbiting Particle for Visual Timing (Optional polish) */}
          <div className={`absolute w-full h-full rounded-full border-2 border-transparent border-t-cyan-300 animate-spin-slow opacity-30`}></div>
        </div>

        <p className="mt-12 text-slate-400 max-w-md text-center">
          Follow the rhythm: Inhale for 4s, Hold for 4s, Exhale for 4s, Hold for 4s.
          This technique helps reduce stress and improve focus.
        </p>
      </div>
    </div>
  );
};

const ShutdownRitual = ({ user, onClose }) => {
  const [step, setStep] = useState(0);
  const [tomorrowTasks, setTomorrowTasks] = useState(['', '', '']);

  const handleTaskChange = (index, value) => {
    const newTasks = [...tomorrowTasks];
    newTasks[index] = value;
    setTomorrowTasks(newTasks);
  };

  const completeRitual = async () => {
    if (user) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'shutdowns'), {
        date: serverTimestamp(),
        tomorrowTasks
      });
    }
    onClose();
  };

  return (
    <div className='fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4'>
      <div className='bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl'>
        <h2 className='text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2'><Moon size={24} className='text-indigo-600' /> Shutdown Ritual</h2>
        {step === 0 && (
          <div className='space-y-6'>
            <p className='text-slate-600'>Let's close out the day. Clear your mind and your workspace.</p>
            <div className='space-y-4'>
              <label className='flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors'>
                <input type='checkbox' className='w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500' />
                <span className='font-medium text-slate-700'>Clear physical desktop</span>
              </label>
              <label className='flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors'>
                <input type='checkbox' className='w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500' />
                <span className='font-medium text-slate-700'>Close all browser tabs</span>
              </label>
            </div>
            <button onClick={() => setStep(1)} className='w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors'>Next: Plan Tomorrow</button>
          </div>
        )}
        {step === 1 && (
          <div className='space-y-6'>
            <p className='text-slate-600'>What are your Big 3 for tomorrow?</p>
            <div className='space-y-3'>
              {tomorrowTasks.map((task, i) => (
                <input key={i} type='text' value={task} onChange={(e) => handleTaskChange(i, e.target.value)} placeholder={`Task ${i + 1}`} className='w-full p-3 bg-slate-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all' />
              ))}
            </div>
            <button onClick={completeRitual} className='w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors'>Complete Shutdown</button>
          </div>
        )}
      </div>
    </div>
  );
};


const Cockpit = ({ user, energyLevel, setEnergyLevel, dailyCount, setActiveTab, onShutdown }) => {
  const [greeting, setGreeting] = useState('');
  const [randomNote, setRandomNote] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotes(fetchedNotes);
      if (fetchedNotes.length > 0 && !randomNote) {
        setRandomNote(fetchedNotes[Math.floor(Math.random() * fetchedNotes.length)]);
      }
    });
    return unsubscribe;
  }, [user]);

  const shuffleNote = () => {
    if (notes.length > 0) {
      setRandomNote(notes[Math.floor(Math.random() * notes.length)]);
    }
  };

  const getEnergyLabel = (level) => {
    if (level <= 3) return { text: 'Low Battery', color: 'text-red-500', bg: 'bg-red-50' };
    if (level <= 7) return { text: 'Stable', color: 'text-amber-500', bg: 'bg-amber-50' };
    return { text: 'Fully Charged', color: 'text-emerald-500', bg: 'bg-emerald-50' };
  };

  const energyInfo = getEnergyLabel(energyLevel);

  return (
    <div className="h-full flex flex-col gap-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">{greeting}, {user.displayName?.split(' ')[0] || 'Pilot'}</h1>
          <p className="text-slate-400 mt-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <button onClick={onShutdown} className='flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl shadow-sm hover:bg-slate-700 transition-colors mr-2'><Power size={18} /> Shutdown</button>
        <div className='flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100'>
          <Trophy size={20} className="text-indigo-500" />
          <span className="font-bold text-slate-700">{dailyCount}</span>
          <span className="text-slate-400 text-sm">focus sessions</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5"><Zap size={120} /></div>
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-slate-700 mb-2 flex items-center gap-2"><Activity size={20} className="text-indigo-500" /> Energy Levels</h2>
            <p className="text-slate-400 text-sm mb-8">Adjust your energy to filter tasks and optimize your workflow.</p>

            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400 font-medium">Drained</span>
              <span className={`font-bold ${energyInfo.color} px-3 py-1 rounded-full ${energyInfo.bg} text-sm`}>{energyLevel}/10 • {energyInfo.text}</span>
              <span className="text-slate-400 font-medium">Hyper</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={energyLevel}
              onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
              className="w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-700 transition-all"
            />
            <div className="flex justify-between mt-2 text-xs text-slate-300 font-mono">
              <span>1</span><span>5</span><span>10</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-3xl shadow-lg text-white flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"><FileText size={120} /></div>
          <div className="relative z-10 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><Radio size={20} className="text-emerald-400 animate-pulse" /> Daily Briefing</h2>
              <button onClick={shuffleNote} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white" title="Shuffle Note"><RotateCcw size={16} /></button>
            </div>

            {randomNote ? (
              <div className="flex-1 flex flex-col">
                <h3 className="text-lg font-semibold mb-2 text-emerald-200 line-clamp-1">{randomNote.title || 'Untitled Note'}</h3>
                <p className="text-slate-300 text-sm leading-relaxed line-clamp-4 mb-4 flex-1">
                  {randomNote.content || 'No content...'}
                </p>
                <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-slate-400">
                  <Clock size={12} /> Resurfaced from {new Date(randomNote.updatedAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-2">
                <FileText size={32} className="opacity-50" />
                <p>No notes found in your library.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div onClick={() => setActiveTab('pomodoro')} className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-indigo-100 transition-colors group">
          <div className="p-3 bg-white rounded-xl shadow-sm text-indigo-600 group-hover:scale-110 transition-transform"><Play size={24} fill="currentColor" /></div>
          <span className="font-semibold text-indigo-900">Start Focus</span>
        </div>
        <div onClick={() => setActiveTab('habits')} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-emerald-100 transition-colors group">
          <div className="p-3 bg-white rounded-xl shadow-sm text-emerald-600 group-hover:scale-110 transition-transform"><CheckSquare size={24} /></div>
          <span className='font-semibold text-emerald-900'>Log Habit</span>
        </div>
        <div className='bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-colors group' onClick={() => alert('Triggering Smart Home Focus Mode...')}>
          <div className='p-3 bg-white rounded-xl shadow-sm text-slate-600 group-hover:scale-110 transition-transform'><Zap size={24} /></div>
          <span className='font-semibold text-slate-900'>Smart Home</span>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP SHELL ---

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('cockpit');
  const [showShutdown, setShowShutdown] = useState(false);
  const [loading, setLoading] = useState(true);

  // Persistent Pomodoro State
  const WORK_TIME = 25 * 60;
  const BREAK_TIME = 5 * 60;
  const [timeLeft, setTimeLeft] = useState(WORK_TIME);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('work');
  const [volume, setVolume] = useState(0.5);
  const [showConfetti, setShowConfetti] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [energyLevel, setEnergyLevel] = useState(5); // 1-10 scale

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Handle Google Login
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  // Pomodoro Logic
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'pomodoro_sessions'), orderBy('completedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const today = new Date().toDateString();
      const count = snapshot.docs.filter(doc => {
        const date = doc.data().completedAt?.toDate();
        return date && date.toDateString() === today;
      }).length;
      setDailyCount(count);
    }, (error) => console.error("Error fetching pomodoro sessions:", error));
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      handleComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const handleComplete = async () => {
    setIsActive(false);
    playNotificationSound(volume, 'complete');
    if (mode === 'work') {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'pomodoro_sessions'), { completedAt: serverTimestamp(), duration: 25, mode: 'work' });
      }
    }
  };

  const toggleTimer = () => { if (!isActive) playNotificationSound(volume, 'click'); setIsActive(!isActive); };
  const resetTimer = () => { setIsActive(false); setTimeLeft(mode === 'work' ? WORK_TIME : BREAK_TIME); };
  const switchMode = (newMode) => { setMode(newMode); setIsActive(false); setTimeLeft(newMode === 'work' ? WORK_TIME : BREAK_TIME); };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400 space-y-4">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-medium animate-pulse">Loading your workspace...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="text-center space-y-6 p-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg text-white mb-4">
            <Layout size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Welcome Back</h1>
          <p className="text-slate-500 max-w-xs mx-auto">Sign in to access your dashboard, tasks, and habits.</p>
          <button
            onClick={handleLogin}
            className="flex items-center justify-center gap-3 px-8 py-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 text-slate-700 font-medium w-full max-w-xs mx-auto"
          >
            <LogIn size={20} className="text-indigo-600" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'cockpit': return <Cockpit user={user} energyLevel={energyLevel} setEnergyLevel={setEnergyLevel} dailyCount={dailyCount} setActiveTab={setActiveTab} onShutdown={() => setShowShutdown(true)} />;
      case 'pomodoro': return <Pomodoro timeLeft={timeLeft} isActive={isActive} mode={mode} toggleTimer={toggleTimer} resetTimer={resetTimer} switchMode={switchMode} volume={volume} setVolume={setVolume} dailyCount={dailyCount} />;
      case 'kanban': return <Kanban user={user} energyLevel={energyLevel} />;
      case 'notes': return <Notes user={user} />;
      case 'habits': return <HabitTracker user={user} />;
      case 'sounds': return <FocusSounds />;
      case 'breathing': return <BreathingBox />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Confetti isActive={showConfetti} />
      {showShutdown && <ShutdownRitual user={user} onClose={() => setShowShutdown(false)} />}
      <div className="w-24 bg-white flex flex-col items-center py-8 space-y-8 shadow-2xl z-20 border-r border-slate-100">
        <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-white shadow-lg shadow-indigo-200"><Layout size={28} /></div>
        <nav className="flex-1 flex flex-col gap-6 w-full px-3">
          <NavButton icon={Home} label="Cockpit" active={activeTab === 'cockpit'} onClick={() => setActiveTab('cockpit')} />
          <NavButton icon={RotateCcw} label="Focus" active={activeTab === 'pomodoro'} onClick={() => setActiveTab('pomodoro')} />
          <NavButton icon={Activity} label="Habits" active={activeTab === 'habits'} onClick={() => setActiveTab('habits')} />
          <NavButton icon={GripVertical} label="Kanban" active={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} />
          <NavButton icon={FileText} label="Notes" active={activeTab === 'notes'} onClick={() => setActiveTab('notes')} />
          <NavButton icon={Music} label="Sounds" active={activeTab === 'sounds'} onClick={() => setActiveTab('sounds')} />
          <NavButton icon={CloudRain} label="Breathing" active={activeTab === 'breathing'} onClick={() => setActiveTab('breathing')} />
        </nav>
        <div className="mt-auto mb-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer shadow-sm overflow-hidden" title={`User: ${user.email}`}>
            {user.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : <User size={20} />}
          </div>
        </div>
        <button onClick={() => signOut(auth)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Sign Out"><LogOut size={20} /></button>
      </div>
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50/50">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center px-10 justify-between sticky top-0 z-10">
          <div><h1 className="text-2xl font-bold text-slate-800 capitalize tracking-tight">{activeTab === 'sounds' ? 'Focus Sounds' : activeTab}</h1><p className="text-xs text-slate-400 font-medium mt-1"> Productivity Dashboard v2.1</p></div>
          <div className="flex items-center gap-3 text-xs font-semibold bg-slate-100 px-3 py-1.5 rounded-full text-slate-500"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>Syncing to Cloud</div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 scroll-smooth"><div className="max-w-7xl mx-auto h-full">{renderContent()}</div></div>
        {activeTab !== 'pomodoro' && <MiniTimer timeLeft={timeLeft} isActive={isActive} mode={mode} toggleTimer={toggleTimer} onExpand={() => setActiveTab('pomodoro')} />}
      </main>
    </div>
  );
};

const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full aspect-square flex flex-col items-center justify-center rounded-2xl transition-all duration-300 group relative ${active ? 'bg-indigo-50 text-indigo-600 shadow-inner' : 'text-slate-400 hover:bg-white hover:shadow-md hover:text-slate-600 hover:-translate-y-0.5'}`}>
    <Icon size={26} className={`mb-1 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] font-bold tracking-wide absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-all bg-slate-800 text-white px-2 py-1 rounded-lg z-50 pointer-events-none shadow-xl translate-y-2 group-hover:translate-y-0">{label}</span>
  </button>
);

export default App;