import React, { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import './Capture.css';

// ---------- helpers ----------
function bufferToHex(uint8Array) {
  return Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

function CameraCapture() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // 🔒 raw chunks (authoritative bytes)
  const rawChunksRef = useRef([]);

  // UI state
  const [sessionId, setSessionId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // ---------- OPEN CAMERA ----------
  const openCamera = async () => {
    if (cameraOpen) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: true
    });

    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    setCameraOpen(true);
  };

  // ---------- CLOSE CAMERA ----------
  const closeCamera = () => {
    if (!streamRef.current) return;

    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  };

  // ---------- START RECORDING ----------
  const startRecording = () => {
    if (!streamRef.current || isRecording) return;

    const id = crypto.randomUUID();
    setSessionId(id);
    rawChunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = recorder;

    let chunkIndex = 0;

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;

      // authoritative bytes
      rawChunksRef.current.push(event.data);

      // chunk hash (ledger for partial verification)
      const chunkHashBytes = await sha256(event.data);
      const chunkHashHex = bufferToHex(chunkHashBytes);

      await supabase.from('video_hashes').insert([{
        session_id: id,
        chunk_index: chunkIndex,
        hash: chunkHashHex
      }]);

      chunkIndex++;
    };

    recorder.start(5000); // 5-second chunks
    setIsRecording(true);
  };

  // ---------- STOP RECORDING ----------
  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const recorder = mediaRecorderRef.current;
    setIsRecording(false);

    recorder.onstop = async () => {
      // final video blob (byte-perfect)
      const finalBlob = new Blob(rawChunksRef.current, {
        type: 'video/webm'
      });

      const finalHashBytes = await sha256(finalBlob);
      const finalHashHex = bufferToHex(finalHashBytes);

      const { error } = await supabase
        .from('video_sessions')
        .insert([{
          session_id: sessionId,
          final_hash: finalHashHex
        }]);

      console.log('SESSION INSERT ATTEMPT:', {
        sessionId,
        error
      });
    };

    recorder.stop();
  };

  // ---------- DOWNLOAD VIDEO ----------
  const downloadVideo = () => {
    if (rawChunksRef.current.length === 0) return;

    const blob = new Blob(rawChunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${sessionId}.webm`;
    a.click();

    URL.revokeObjectURL(url);
  };

  // ---------- UI ----------
  return (
    <div className="capture-root">
      <video
        ref={videoRef}
        className="capture-video"
        autoPlay
        muted
        playsInline
      />

      <div className="capture-controls">
        <div className="button-row">
          <button
            className="btn-secondary"
            onClick={openCamera}
            disabled={cameraOpen}
          >
            Open Camera
          </button>

          <button
            className="btn-secondary"
            onClick={closeCamera}
            disabled={!cameraOpen}
          >
            Close Camera
          </button>
        </div>

        <div className="button-row">
          <button
            className="btn-primary"
            onClick={startRecording}
            disabled={!cameraOpen || isRecording}
          >
            Start Recording
          </button>

          <button
            className="btn-danger"
            onClick={stopRecording}
            disabled={!isRecording}
          >
            Stop Recording
          </button>
        </div>

        <div className="button-row">
          <button
            className="btn-secondary"
            onClick={downloadVideo}
            disabled={rawChunksRef.current.length === 0}
            style={{ gridColumn: '1 / -1' }}
          >
            Download Video
          </button>
        </div>

        {sessionId && (
          <div className="session-id">
            Session ID: {sessionId}
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraCapture;
