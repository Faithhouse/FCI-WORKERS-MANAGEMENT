import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface ScannerProps {
  onScan: (data: string) => void;
  isLoading?: boolean;
}

export default function Scanner({ onScan, isLoading }: ScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      scannerRef.current.render(
        (decodedText) => {
          if (!isLoading) {
            onScan(decodedText);
          }
        },
        (error) => {
          // console.warn(error);
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => {
            console.error("Failed to clear scanner", err);
        });
        scannerRef.current = null;
      }
    };
  }, [onScan, isLoading]);

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden rounded-2xl bg-white shadow-xl border border-gray-100">
      <div id="qr-reader" className="w-full"></div>
      <div className="p-4 bg-gray-50 text-center">
        <p className="text-sm text-gray-500 font-medium">Position the QR code within the frame</p>
      </div>
    </div>
  );
}
