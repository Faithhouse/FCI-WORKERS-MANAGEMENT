import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Worker } from '../types';
import { Download, User, Trash2, MoreHorizontal, FileText } from 'lucide-react';
import { motion } from 'motion/react';

interface WorkerCardProps {
  key?: string | number;
  worker: Worker;
  onDelete?: (id: string) => void;
}

export default function WorkerCard({ worker, onDelete }: WorkerCardProps) {
  const downloadQR = () => {
    const canvas = document.getElementById(`qr-${worker.id}`) as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `${worker.name.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2rem] p-4.5 shadow-sm border border-slate-100 flex items-center gap-5 hover:shadow-xl hover:shadow-slate-200/40 transition-all active:scale-[0.98] group relative"
    >
      {/* Left: Avatar/QR Container */}
      <div className="flex-shrink-0 relative">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 flex items-center justify-center p-2 transition-all group-hover:scale-110 group-hover:-rotate-3">
          <QRCodeCanvas
            id={`qr-${worker.id}`}
            value={worker.qrCodeId}
            size={56}
            level={"L"}
          />
        </div>
      </div>

      {/* Center: Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-slate-900 truncate tracking-tight text-base mb-1.5 uppercase group-hover:text-blue-900 transition-colors">{worker.name}</h3>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-blue-900 text-[9px] font-black uppercase tracking-[0.1em] rounded-lg border border-blue-100/30">
            {worker.role}
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            downloadQR();
          }}
          className="p-3 text-slate-400 hover:text-blue-900 hover:bg-slate-50 rounded-2xl transition-all active:scale-90"
          title="Download Digital Badge"
        >
          <FileText size={20} strokeWidth={2.5} />
        </button>
        
        {onDelete && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(worker.id);
            }}
            className="p-3 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all active:scale-90"
            title="Revoke Access"
          >
            <Trash2 size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
