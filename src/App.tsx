import React, { useState, useEffect } from 'react';
import { auth, db, loginWithGoogle, logout, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc, doc, where, limit, getDocs } from 'firebase/firestore';
import { Worker, AttendanceRecord, OperationType } from './types';
import { 
  Users, 
  Scan, 
  LayoutDashboard, 
  LogOut, 
  LogIn, 
  ShieldCheck, 
  Plus, 
  CheckCircle2, 
  XCircle,
  Clock,
  Calendar,
  History,
  ClipboardCheck,
  User,
  Search,
  Filter,
  Settings,
  MoreVertical,
  QrCode,
  Heart,
  Trash2,
  ChevronRight,
  TrendingUp,
  Lock,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import Scanner from './components/Scanner';
import WorkerCard from './components/WorkerCard';
import { format, startOfDay, endOfDay } from 'date-fns';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scanner' | 'workers'>('dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isAddingWorker, setIsAddingWorker] = useState(false);
  const [isManualLogOpen, setIsManualLogOpen] = useState(false);
  const [isSelectingWorker, setIsSelectingWorker] = useState(false);
  const [manualLog, setManualLog] = useState<{ workerId: string, type: 'clock-in' | 'clock-out' }>({ workerId: '', type: 'clock-in' });
  const [newWorker, setNewWorker] = useState({ name: '', role: '', email: '' });
  const [scanStatus, setScanStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Admin and Personal Identity check
  const isAdmin = user?.email === 'fcbhahbtwog@gmail.com';
  const myProfile = workers.find(w => w.email?.toLowerCase() === user?.email?.toLowerCase());

  const roles = ['All', ...Array.from(new Set(workers.map(w => w.role)))];
  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         w.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'All' || w.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const workersQuery = query(collection(db, 'workers'), orderBy('createdAt', 'desc'));
    const unsubscribeWorkers = onSnapshot(workersQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Worker));
      setWorkers(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'workers'));

    const dateObj = new Date(selectedDate);
    const dayStart = startOfDay(dateObj);
    const dayEnd = endOfDay(dateObj);

    let attendanceQuery;
    if (isAdmin) {
      attendanceQuery = query(
        collection(db, 'attendance'), 
        where('timestamp', '>=', dayStart),
        where('timestamp', '<=', dayEnd),
        orderBy('timestamp', 'desc')
      );
    } else {
      // Workers only see their own history for the month/range or the selected day
      attendanceQuery = query(
        collection(db, 'attendance'), 
        where('workerId', '==', myProfile?.id || 'none'),
        where('timestamp', '>=', dayStart),
        where('timestamp', '<=', dayEnd),
        orderBy('timestamp', 'desc')
      );
    }
    
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setAttendance(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    return () => {
      unsubscribeWorkers();
      unsubscribeAttendance();
    };
  }, [user, selectedDate, isAdmin, myProfile?.id]);

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.name || !newWorker.role || !newWorker.email) return;

    try {
      setLoading(true);
      const workerId = crypto.randomUUID();
      await addDoc(collection(db, 'workers'), {
        ...newWorker,
        qrCodeId: workerId,
        createdAt: serverTimestamp()
      });
      setNewWorker({ name: '', role: '', email: '' });
      setIsAddingWorker(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workers');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorker = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'workers', id));
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `workers/${id}`);
    }
  };

  const handleManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLog.workerId) return;

    try {
      setLoading(true);
      const worker = workers.find(w => w.id === manualLog.workerId);
      if (!worker) return;

      await addDoc(collection(db, 'attendance'), {
        workerId: worker.id,
        workerName: worker.name,
        timestamp: serverTimestamp(),
        type: manualLog.type
      });

      setIsManualLogOpen(false);
      setManualLog({ workerId: '', type: 'clock-in' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (qrData: string) => {
    if (loading) return;

    // Check if it's the General Station QR
    if (qrData === 'FAITHHOUSE_GENERAL_STATION') {
      setIsSelectingWorker(true);
      return;
    }

    try {
      setLoading(true);
      // Find the worker with this qrData
      const q = query(collection(db, 'workers'), where('qrCodeId', '==', qrData), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setScanStatus({ type: 'error', message: 'Unknown QR Code' });
        setTimeout(() => setScanStatus(null), 3000);
        return;
      }

      const workerDoc = querySnapshot.docs[0];
      const workerData = workerDoc.data() as Worker;

      // Check last attendance to toggle clock-in/out
      const lastAttendanceQuery = query(
        collection(db, 'attendance'), 
        where('workerId', '==', workerDoc.id), 
        orderBy('timestamp', 'desc'), 
        limit(1)
      );
      const lastAttendanceSnapshot = await getDocs(lastAttendanceQuery);
      
      let type: 'clock-in' | 'clock-out' = 'clock-in';
      if (!lastAttendanceSnapshot.empty) {
        const lastRecord = lastAttendanceSnapshot.docs[0].data() as AttendanceRecord;
        type = lastRecord.type === 'clock-in' ? 'clock-out' : 'clock-in';
      }

      await addDoc(collection(db, 'attendance'), {
        workerId: workerDoc.id,
        workerName: workerData.name,
        timestamp: serverTimestamp(),
        type
      });

      setScanStatus({ 
        type: 'success', 
        message: `${workerData.name} ${type === 'clock-in' ? 'Clocked In' : 'Clocked Out'}!` 
      });
      setTimeout(() => setScanStatus(null), 4000);
    } catch (err) {
      console.error(err);
      setScanStatus({ type: 'error', message: 'Scan failed' });
      setTimeout(() => setScanStatus(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Users className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Faithhouse Chapel Int'l</h1>
          <p className="text-slate-500 mb-8">Church Worker Attendance System</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-95 shadow-lg shadow-slate-200"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pt-20 pb-24 md:pt-24 md:pb-8">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 md:h-20 bg-white border-b border-slate-100 z-50 flex items-center px-4 md:px-8">
        <div className="flex items-center gap-3.5 flex-1">
          <div className="w-11 h-11 bg-blue-900 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-900/20 transform transition-transform hover:scale-105 active:scale-95">
            <Heart className="text-white" size={22} fill="white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight">Faithhouse</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Chapel</span>
              <div className="w-1 h-1 bg-slate-200 rounded-full" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">International</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end mr-3">
            <span className="text-sm font-black text-slate-900 tracking-tight">{user.displayName}</span>
            <div className="flex items-center gap-2 mt-0.5">
              {isAdmin ? (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[8px] font-black uppercase tracking-widest rounded-md border border-blue-100/50">
                  Authority
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded-md border border-slate-100">
                  {myProfile ? 'Steward' : 'Visitor'}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center bg-slate-50/50 rounded-2xl p-1 border border-slate-100">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 text-slate-400 hover:text-blue-900 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm"
            >
              <Settings size={18} />
            </button>
            <button 
              onClick={logout}
              className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8">
        {!isAdmin && !myProfile && activeTab === 'dashboard' ? (
           <div className="flex flex-col items-center justify-center py-20 text-center">
             <XCircle size={64} className="text-slate-200 mb-4" />
             <h2 className="text-2xl font-black text-slate-900 mb-2">Access Restricted</h2>
             <p className="text-slate-500 max-w-xs">Your email ({user.email}) is not registered in our church worker database. Please contact an administrator.</p>
           </div>
        ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              {/* Dashboard Statistics Grid */}
              <div className="flex flex-col gap-5">
                {isAdmin ? (
                  <>
                    {/* Featured Primary Card - Admin View */}
                    <motion.div 
                      whileHover={{ scale: 0.99, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="group relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 p-7 rounded-[2.5rem] shadow-2xl shadow-blue-900/20 cursor-pointer transition-all border border-white/5"
                    >
                      <div className="absolute -right-12 -top-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500" />
                      <div className="absolute left-0 top-0 w-full h-full bg-blue-400/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <div className="w-14 h-14 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
                            <Users size={28} className="text-white" />
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em] mb-1">Census Management</span>
                            <div className="px-2 py-1 bg-green-500/20 text-green-400 text-[8px] font-black uppercase tracking-widest rounded-lg border border-green-500/20 flex items-center gap-1">
                              <span className="w-1 h-1 bg-green-400 rounded-full animate-pulse" /> Live Now
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-end gap-4 mb-2">
                          <span className="text-7xl font-black text-white tracking-tighter leading-none drop-shadow-md">
                            {workers.length}
                          </span>
                          <div className="flex flex-col mb-1.5">
                            <span className="text-xl font-black text-blue-100 tracking-tight">Active Workers</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-5 border-t border-white/5">
                          <p className="text-blue-100/40 text-[10px] font-bold uppercase tracking-wider italic">Faithhouse Operations</p>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab('workers');
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-black text-white uppercase tracking-widest bg-white/5 py-2 px-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors"
                          >
                            Manage registry <ChevronRight size={12} className="text-blue-300" />
                          </button>
                        </div>
                      </div>
                    </motion.div>

                    {/* Secondary Grid Section */}
                    <div className="grid grid-cols-2 gap-4">
                      <motion.div 
                        whileHover={{ y: -4 }}
                        className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-slate-100 flex flex-col justify-between min-h-[160px] group transition-all hover:shadow-xl hover:shadow-slate-200/40"
                      >
                        <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center border border-green-100/50 transition-colors group-hover:bg-green-600 group-hover:text-white">
                          <Clock size={24} />
                        </div>
                        <div className="mt-4">
                          <div className="text-4xl font-black text-slate-900 tracking-tighter mb-1">
                            {attendance.filter(a => format(new Date(a.timestamp?.toDate() || Date.now()), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today Logs</span>
                            <span className="text-[10px] font-bold text-green-500">Active</span>
                          </div>
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ y: -4 }}
                        className="bg-white p-6 rounded-[2.2rem] shadow-sm border border-slate-100 flex flex-col justify-between min-h-[160px] group transition-all hover:shadow-xl hover:shadow-slate-200/40"
                      >
                        <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center border border-purple-100/50 transition-colors group-hover:bg-purple-600 group-hover:text-white">
                          <History size={24} />
                        </div>
                        <div className="mt-4">
                          <div className="text-2xl font-black text-slate-900 tracking-tighter mb-1 truncate">
                             {format(new Date(selectedDate), 'dd')} 
                             <span className="text-sm text-slate-400 ml-1 font-bold">{format(new Date(selectedDate), 'MMM')}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Log Date</span>
                            <div className="w-2 h-2 bg-purple-400 rounded-full" />
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Worker Personal Portal */}
                    <div className="bg-white p-7 rounded-[2.5rem] shadow-xl shadow-blue-900/5 border border-slate-100 relative overflow-hidden">
                      <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
                      
                      <div className="relative z-10 flex flex-col gap-8">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-blue-900 text-white rounded-3xl flex items-center justify-center shadow-lg shadow-blue-900/20 border-4 border-blue-50/50">
                              <User size={32} />
                            </div>
                            <div className="flex flex-col">
                              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5">{myProfile?.name}</h3>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-blue-50 text-blue-900 text-[9px] font-black uppercase tracking-[0.1em] rounded-lg">
                                  {myProfile?.role || 'Service Worker'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 py-6 border-y border-slate-50">
                          <div className="flex flex-col gap-1">
                            <span className="text-4xl font-black text-slate-900 tracking-tighter">{attendance.length}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Activity Logs</span>
                          </div>
                          <div className="flex flex-col gap-1 text-right">
                             <span className="text-3xl font-black text-slate-900 tracking-tighter leading-8 pt-1">
                              {format(new Date(selectedDate), 'dd')} 
                              <span className="text-base text-slate-400 ml-1 font-bold">{format(new Date(selectedDate), 'MMM')}</span>
                            </span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Service Date</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center -space-x-2">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                {i}
                              </div>
                            ))}
                            <div className="pl-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Timeline</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-7 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                      <History size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1">{isAdmin ? 'Attendance Registry' : 'My Activity Log'}</h2>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temporal Records</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-900/5 focus:border-blue-900/20 transition-all cursor-pointer shadow-inner"
                      />
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => setIsManualLogOpen(true)}
                        className="bg-blue-900 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest py-3 px-5 rounded-2xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-900/10"
                      >
                        <Plus size={16} />
                        Manual Log
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/30">
                        <th className="px-7 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Steward</th>
                        <th className="px-7 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Check-in</th>
                        <th className="px-7 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record) => (
                        <tr key={record.id} className="border-t border-slate-50 transition-colors hover:bg-slate-50/50 group">
                          <td className="px-7 py-5">
                            <span className="font-extrabold text-slate-900 text-sm tracking-tight group-hover:text-blue-900 transition-colors uppercase">{record.workerName}</span>
                          </td>
                          <td className="px-7 py-5">
                             <div className="flex items-center gap-2">
                               <Clock size={14} className="text-slate-300" />
                               <span className="text-slate-500 text-xs font-bold font-mono">
                                {record.timestamp ? format(record.timestamp.toDate(), 'HH:mm:ss') : 'LIVE'}
                              </span>
                             </div>
                          </td>
                          <td className="px-7 py-5">
                            <span className={cn(
                              "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] border",
                              record.type === 'clock-in' 
                                ? "bg-green-50 text-green-700 border-green-100" 
                                : "bg-orange-50 text-orange-700 border-orange-100"
                            )}>
                              {record.type}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {attendance.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-7 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 opacity-20">
                              <History size={48} className="text-slate-900" />
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.25em]">No records found for this period</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'scanner' && (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-xl mx-auto"
            >
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-blue-100/50 mb-4">
                  <div className="w-1.5 h-1.5 bg-blue-900 rounded-full animate-pulse" /> Live Terminal
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Security Check-in</h2>
                <p className="text-slate-400 text-sm font-medium">Position the Station QR within the frame to authorize attendance</p>
              </div>

              {!isSelectingWorker ? (
                <div className="relative group">
                  <div className="absolute -inset-4 bg-blue-900/5 rounded-[2.5rem] blur-2xl group-hover:bg-blue-900/10 transition-all opacity-0 group-hover:opacity-100" />
                  <div className="relative border-4 border-white shadow-2xl rounded-[2.5rem] overflow-hidden">
                    <Scanner onScan={handleScan} isLoading={loading} />
                  </div>
                  
                  <AnimatePresence>
                    {scanStatus && (
                      <motion.div 
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "absolute -bottom-28 left-0 right-0 p-8 rounded-[2rem] flex items-center gap-5 shadow-2xl border-2 z-[60]",
                          scanStatus.type === 'success' 
                            ? "bg-slate-900 border-slate-800 text-white" 
                            : "bg-red-600 border-red-500 text-white"
                        )}
                      >
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0",
                          scanStatus.type === 'success' ? "bg-green-500/20 text-green-400" : "bg-white/20 text-white"
                        )}>
                          {scanStatus.type === 'success' ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-black tracking-tight leading-none mb-1">{scanStatus.type === 'success' ? 'Authorized' : 'Denied'}</h4>
                          <span className="text-sm font-bold opacity-80">{scanStatus.message}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-blue-900/5 border border-slate-100"
                >
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5">Identify Yourself</h2>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Manual Registry Access</p>
                    </div>
                    <button 
                      onClick={() => setIsSelectingWorker(false)} 
                      className="px-4 py-2 bg-slate-50 text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-all"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-3 scrollbar-hide">
                    {workers.map(worker => (
                      <motion.button
                        key={worker.id}
                        whileHover={{ x: 8 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => {
                          const lastAttendanceQuery = query(
                            collection(db, 'attendance'), 
                            where('workerId', '==', worker.id), 
                            orderBy('timestamp', 'desc'), 
                            limit(1)
                          );
                          const lastAttendanceSnapshot = await getDocs(lastAttendanceQuery);
                          let type: 'clock-in' | 'clock-out' = 'clock-in';
                          if (!lastAttendanceSnapshot.empty) {
                            const lastRecord = lastAttendanceSnapshot.docs[0].data() as AttendanceRecord;
                            type = lastRecord.type === 'clock-in' ? 'clock-out' : 'clock-in';
                          }
                          await addDoc(collection(db, 'attendance'), {
                            workerId: worker.id,
                            workerName: worker.name,
                            timestamp: serverTimestamp(),
                            type
                          });
                          setIsSelectingWorker(false);
                          setScanStatus({ type: 'success', message: `Welcome ${worker.name}!` });
                          setTimeout(() => setScanStatus(null), 3000);
                        }}
                        className="w-full text-left p-5 rounded-2xl bg-white hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all group flex items-center justify-between"
                      >
                        <div>
                          <div className="font-extrabold text-slate-900 text-base leading-none mb-1 group-hover:text-blue-900 uppercase">{worker.name}</div>
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 group-hover:border-blue-200 transition-colors">
                            {worker.role}
                          </span>
                        </div>
                        <ChevronRight size={18} className="text-slate-200 group-hover:text-blue-500" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'workers' && isAdmin && (
            <motion.div 
              key="workers"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Actions & Filters Section */}
              <div className="flex flex-col gap-8 bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">Church Registry</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Registry Management</span>
                      <div className="w-1 h-1 bg-slate-200 rounded-full" />
                      <span className="text-[10px] font-black text-blue-900 uppercase tracking-[0.25em]">{filteredWorkers.length} Members</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        const canvas = document.getElementById('general-station-qr') as HTMLCanvasElement;
                        const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
                        let downloadLink = document.createElement("a");
                        downloadLink.href = pngUrl;
                        downloadLink.download = "faithhouse-station.png";
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                      }}
                      className="p-4 bg-slate-50 border border-slate-100 text-slate-400 rounded-2xl transition-all hover:bg-white hover:text-blue-900 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-900/5 active:scale-95"
                      title="Generate Access Terminal QR"
                    >
                      <QrCode size={22} strokeWidth={2.5} />
                      <QRCodeCanvas
                        id="general-station-qr"
                        value="FAITHHOUSE_GENERAL_STATION"
                        size={40}
                        style={{ display: 'none' }}
                      />
                    </button>
                    <button 
                      onClick={() => setIsAddingWorker(true)}
                      className="flex-1 sm:flex-none bg-blue-900 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-900/20"
                    >
                      <Plus size={18} strokeWidth={3} />
                      Enroll Member
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 pt-6 border-t border-slate-50">
                   <div className="relative">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input 
                      type="text"
                      placeholder="Search member name or service department..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 pl-14 pr-6 py-4.5 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-900/5 focus:border-blue-900/20 focus:bg-white transition-all shadow-inner placeholder:text-slate-300"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide py-1">
                    {roles.map(role => (
                      <button
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        className={cn(
                          "whitespace-nowrap px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0",
                          roleFilter === role 
                            ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200" 
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredWorkers.map(worker => (
                  <WorkerCard 
                    key={worker.id} 
                    worker={worker} 
                    onDelete={isAdmin ? (id) => setDeleteConfirmId(id) : undefined} 
                  />
                ))}
                {filteredWorkers.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    {searchQuery || roleFilter !== 'All' ? 'No workers match your filters.' : 'No workers registered yet.'}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 pt-3 pb-6 md:hidden flex justify-around items-center z-50">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "p-2 flex flex-col items-center gap-1.5 transition-all relative",
            activeTab === 'dashboard' ? "text-blue-900" : "text-slate-300"
          )}
        >
          <LayoutDashboard size={24} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Home</span>
          {activeTab === 'dashboard' && <motion.div layoutId="nav-indicator" className="absolute -top-3 w-8 h-1 bg-blue-900 rounded-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('scanner')}
          className={cn(
            "p-2 flex flex-col items-center gap-1.5 transition-all relative",
            activeTab === 'scanner' ? "text-blue-900" : "text-slate-300"
          )}
        >
          <Scan size={24} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Scanner</span>
          {activeTab === 'scanner' && <motion.div layoutId="nav-indicator" className="absolute -top-3 w-8 h-1 bg-blue-900 rounded-full" />}
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab('workers')}
            className={cn(
              "p-2 flex flex-col items-center gap-1.5 transition-all relative",
              activeTab === 'workers' ? "text-blue-900" : "text-slate-300"
            )}
          >
            <Users size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Workers</span>
            {activeTab === 'workers' && <motion.div layoutId="nav-indicator" className="absolute -top-3 w-8 h-1 bg-blue-900 rounded-full" />}
          </button>
        )}
      </nav>

      {/* Desktop Navigation (sidebar-like buttons) */}
      <div className="hidden md:flex fixed top-1/2 left-4 -translate-y-1/2 flex-col gap-4 z-50">
        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Dashboard" />
        <NavButton active={activeTab === 'scanner'} onClick={() => setActiveTab('scanner')} icon={<Scan size={20} />} label="Scanner" />
        {isAdmin && <NavButton active={activeTab === 'workers'} onClick={() => setActiveTab('workers')} icon={<Users size={20} />} label="Workers" />}
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5">Settings</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Account & Preferences</p>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/10">
                      <User size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 truncate leading-none mb-1">{user?.displayName}</p>
                      <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest">{user?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="px-1 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Application</p>
                  <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-900 transition-colors">
                        <Heart size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Church Profile</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-900 transition-colors">
                        <Lock size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-600">Permissions</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>
                </div>

                <button 
                  onClick={logout}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  <LogOut size={16} />
                  Sign Out Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-6 max-w-[320px] w-full shadow-2xl border border-slate-100 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Remove Worker?</h3>
              <p className="text-slate-500 text-sm mb-6">This action cannot be undone. All QR access for this worker will be revoked.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteConfirmId && handleDeleteWorker(deleteConfirmId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-2xl shadow-lg shadow-red-100"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Worker Modal */}
      <AnimatePresence>
        {isAddingWorker && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-5 max-w-[340px] w-full shadow-2xl border border-slate-100"
            >
              <h2 className="text-lg font-black text-slate-900 mb-4 px-1">New Worker</h2>
              <form onSubmit={handleAddWorker} className="space-y-3.5">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1.5 px-1">Full Name</label>
                  <input 
                    type="text" 
                    value={newWorker.name}
                    onChange={e => setNewWorker({ ...newWorker, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-900 transition-all font-medium"
                    placeholder="e.g. David Ramson"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1.5 px-1">Enrolment Email</label>
                  <input 
                    type="email" 
                    value={newWorker.email}
                    onChange={e => setNewWorker({ ...newWorker, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-900 transition-all font-medium"
                    placeholder="email@faithhouse.org"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1.5 px-1">Service Department</label>
                  <input 
                    type="text" 
                    value={newWorker.role}
                    onChange={e => setNewWorker({ ...newWorker, role: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-900 transition-all font-medium"
                    placeholder="e.g. MEDIA, USHER"
                    required
                  />
                </div>
                <div className="flex gap-2 pt-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddingWorker(false)}
                    className="flex-1 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-[1.5] bg-blue-900 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-2xl transition-all shadow-lg shadow-blue-900/10 disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : 'Register'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Log Modal */}
      <AnimatePresence>
        {isManualLogOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <h2 className="text-2xl font-black text-slate-900 mb-6">Manual Attendance</h2>
              <form onSubmit={handleManualLog} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Select Worker</label>
                  <select 
                    value={manualLog.workerId}
                    onChange={e => setManualLog({ ...manualLog, workerId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    required
                  >
                    <option value="">Choose a worker...</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Action Type</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setManualLog({ ...manualLog, type: 'clock-in' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold transition-all",
                        manualLog.type === 'clock-in' ? "bg-green-100 text-green-700 border-2 border-green-500" : "bg-slate-50 text-slate-500 border-2 border-transparent"
                      )}
                    >
                      Clock In
                    </button>
                    <button 
                      type="button"
                      onClick={() => setManualLog({ ...manualLog, type: 'clock-out' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold transition-all",
                        manualLog.type === 'clock-out' ? "bg-orange-100 text-orange-700 border-2 border-orange-500" : "bg-slate-50 text-slate-500 border-2 border-transparent"
                      )}
                    >
                      Clock Out
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsManualLogOpen(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading || !manualLog.workerId}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg disabled:opacity-50"
                  >
                    {loading ? 'Recording...' : 'Log Attendance'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "group relative w-12 h-12 flex items-center justify-center rounded-xl transition-all shadow-sm",
        active ? "bg-blue-600 text-white shadow-blue-200" : "bg-white text-slate-400 hover:text-slate-600 hover:shadow-md"
      )}
    >
      {icon}
      <span className="absolute left-14 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
        {label}
      </span>
    </button>
  );
}
