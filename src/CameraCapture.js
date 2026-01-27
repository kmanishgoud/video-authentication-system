import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';

function CameraCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState('');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [chunkHashes, setChunkHashes] = useState([]);
  const [queuedHashes, setQueuedHashes] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // Monitor online/offline status
  useEffect(() => {
    // Set initial state correctly
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      console.log('🌐 Back online!');
      setIsOnline(true);
      syncQueuedHashes();
    };
    
    const handleOffline = () => {
      console.log('📡 Internet lost!');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    loadQueuedHashes();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start camera
  const startCamera = async () => {
    try {
      setError('');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      streamRef.current = stream;
      setIsCameraOn(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      console.log('✅ Camera started successfully');
      
    } catch (err) {
      console.error('Error accessing camera:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Error accessing camera: ' + err.message);
      }
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsCameraOn(false);
  };

  // Generate SHA-256 hash from blob
  const generateHash = async (blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return hashHex;
    } catch (err) {
      console.error('Error generating hash:', err);
      throw err;
    }
  };

  // Save hash to IndexedDB (offline storage)
  const saveHashToIndexedDB = async (hash, chunkIndex, sessionId) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoHashDB', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('pendingHashes')) {
          db.createObjectStore('pendingHashes', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['pendingHashes'], 'readwrite');
        const store = transaction.objectStore('pendingHashes');
        
        const hashData = {
          session_id: sessionId,
          chunk_index: chunkIndex,
          hash: hash,
          timestamp: new Date().toISOString()
        };
        
        store.add(hashData);
        
        transaction.oncomplete = () => {
          console.log(`💾 Saved chunk ${chunkIndex} to local storage`);
          resolve();
        };
        
        transaction.onerror = () => reject(transaction.error);
      };

      request.onerror = () => reject(request.error);
    });
  };

  // Load queued hashes from IndexedDB
  const loadQueuedHashes = async () => {
    return new Promise((resolve) => {
      const request = indexedDB.open('VideoHashDB', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('pendingHashes')) {
          db.createObjectStore('pendingHashes', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('pendingHashes')) {
          console.log('📦 No pending hashes store yet');
          setQueuedHashes([]);
          db.close();
          resolve([]);
          return;
        }
        
        try {
          const transaction = db.transaction(['pendingHashes'], 'readonly');
          const store = transaction.objectStore('pendingHashes');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const hashes = getAllRequest.result || [];
            setQueuedHashes(hashes);
            console.log(`📦 Loaded ${hashes.length} queued hashes from storage`);
            db.close();
            resolve(hashes);
          };

          getAllRequest.onerror = () => {
            console.error('Error loading hashes:', getAllRequest.error);
            db.close();
            resolve([]);
          };
        } catch (err) {
          console.error('Transaction error:', err);
          db.close();
          resolve([]);
        }
      };

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        resolve([]);
      };
    });
  };

  // Remove hash from IndexedDB after successful upload
  const removeHashFromIndexedDB = async (id) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoHashDB', 1);

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['pendingHashes'], 'readwrite');
        const store = transaction.objectStore('pendingHashes');
        store.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };

      request.onerror = () => reject(request.error);
    });
  };

  // Sync queued hashes to database
  const syncQueuedHashes = async () => {
    try {
      const hashes = await loadQueuedHashes();
      
      if (hashes.length === 0) {
        console.log('No queued hashes to sync');
        return;
      }

      console.log(`📤 Syncing ${hashes.length} queued hashes...`);
      let syncedCount = 0;
      
      for (const hashData of hashes) {
        const success = await uploadHashToDatabase(
          hashData.hash,
          hashData.chunk_index,
          hashData.session_id,
          true
        );

        if (success && hashData.id) {
          await removeHashFromIndexedDB(hashData.id);
          syncedCount++;
        }
      }

      console.log(`✅ Synced ${syncedCount} of ${hashes.length} hashes`);
      await loadQueuedHashes();
    } catch (err) {
      console.error('Sync error:', err);
    }
  };

  // Upload hash to database (with offline fallback)
  const uploadHashToDatabase = async (hash, chunkIndex, sessionId, skipQueue = false) => {
    if (!navigator.onLine && !skipQueue) {
      console.log(`📡 Offline - queuing chunk ${chunkIndex}`);
      await saveHashToIndexedDB(hash, chunkIndex, sessionId);
      setQueuedHashes(prev => [...prev, { chunk_index: chunkIndex, hash, session_id: sessionId }]);
      return false;
    }

    try {
      const { error } = await supabase
        .from('video_hashes')
        .insert([
          {
            session_id: sessionId,
            chunk_index: chunkIndex,
            hash: hash
          }
        ]);

      if (error) throw error;
      
      console.log(`✅ Uploaded chunk ${chunkIndex} hash to database`);
      setUploadedChunks(prev => prev + 1);
      return true;
      
    } catch (err) {
      console.error(`❌ Failed to upload chunk ${chunkIndex}:`, err);
      
      if (!skipQueue) {
        console.log(`💾 Saving chunk ${chunkIndex} to local queue`);
        await saveHashToIndexedDB(hash, chunkIndex, sessionId);
        setQueuedHashes(prev => [...prev, { chunk_index: chunkIndex, hash, session_id: sessionId }]);
      }
      return false;
    }
  };

  // Start recording
const startRecording = () => {
  if (!streamRef.current) {
    setError('Please start camera first');
    return;
  }

  try {
    setError('');
    setRecordedChunks([]);
    setRecordedVideoUrl('');
    setUploadedChunks(0);
    setChunkHashes([]);
    
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    console.log('📝 New session ID:', newSessionId);

    // Try different mimeTypes until we find one that works
    let options;
    const mimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
      'video/mp4',
      '' // Let browser choose
    ];

    for (const mimeType of mimeTypes) {
      if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
        options = mimeType ? { mimeType } : {};
        console.log('✅ Using mimeType:', mimeType || 'browser default');
        break;
      }
    }

    const mediaRecorder = new MediaRecorder(streamRef.current, options);
    mediaRecorderRef.current = mediaRecorder;

    let chunkIndex = 0;

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        const currentChunkIndex = chunkIndex++;
        console.log(`📦 Chunk ${currentChunkIndex} received:`, event.data.size, 'bytes');
        
        setRecordedChunks(prev => [...prev, event.data]);
        
        try {
          console.log(`🔐 Generating hash for chunk ${currentChunkIndex}...`);
          const hash = await generateHash(event.data);
          console.log(`🔐 Hash generated for chunk ${currentChunkIndex}:`, hash.substring(0, 16) + '...');
          
          setChunkHashes(prev => [...prev, { index: currentChunkIndex, hash }]);
          
          console.log(`📤 Uploading chunk ${currentChunkIndex} to database...`);
          await uploadHashToDatabase(hash, currentChunkIndex, newSessionId);
          
        } catch (err) {
          console.error(`Error processing chunk ${currentChunkIndex}:`, err);
          setError(`Failed to process chunk ${currentChunkIndex}`);
        }
      }
    };

    mediaRecorder.onstop = () => {
      console.log('⏹️ Recording stopped');
      console.log(`📊 Total chunks: ${chunkIndex}`);
    };

    mediaRecorder.start(5000);
    setIsRecording(true);
    console.log('🔴 Recording started (5-second chunks)');

  } catch (err) {
    console.error('Error starting recording:', err);
    setError('Error starting recording: ' + err.message);
  }
};

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Create playback URL from recorded chunks
  const createVideoUrl = () => {
    if (recordedChunks.length === 0) {
      setError('No recorded video available');
      return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    setRecordedVideoUrl(url);
    console.log('🎬 Video URL created');
  };

  // Download video
  const downloadVideo = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${sessionId}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('💾 Video downloaded');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Real-Time Video Authentication</h1>
      
      <div style={{ 
        marginBottom: '20px', 
        backgroundColor: '#000', 
        borderRadius: '10px',
        overflow: 'hidden',
        aspectRatio: '16/9'
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
        />
      </div>

      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          borderRadius: '5px',
          marginBottom: '10px'
        }}>
          {error}
        </div>
      )}

      <div style={{ 
        padding: '10px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '5px',
        marginBottom: '10px',
        fontSize: '12px'
      }}>
        <strong>Status:</strong><br/>
        Camera: {isCameraOn ? '✅ On' : '❌ Off'}<br/>
        Recording: {isRecording ? '🔴 Yes' : '⚪ No'}<br/>
        Internet: {isOnline ? '🌐 Online' : '📡 Offline'}<br/>
        Chunks Captured: {recordedChunks.length}<br/>
        Chunks Uploaded: {uploadedChunks}<br/>
        {queuedHashes.length > 0 && (
          <>
            <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
              ⏳ Queued for upload: {queuedHashes.length}
            </span><br/>
          </>
        )}
        {sessionId && (
          <>
            <strong>Session ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{sessionId}</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={startCamera}
          disabled={isCameraOn}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isCameraOn ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isCameraOn ? 'not-allowed' : 'pointer'
          }}
        >
          Start Camera
        </button>

        <button
          onClick={stopCamera}
          disabled={!isCameraOn || isRecording}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: (!isCameraOn || isRecording) ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (!isCameraOn || isRecording) ? 'not-allowed' : 'pointer'
          }}
        >
          Stop Camera
        </button>

        <button
          onClick={startRecording}
          disabled={!isCameraOn || isRecording}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: (!isCameraOn || isRecording) ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (!isCameraOn || isRecording) ? 'not-allowed' : 'pointer'
          }}
        >
          Start Recording
        </button>

        <button
          onClick={stopRecording}
          disabled={!isRecording}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: !isRecording ? '#ccc' : '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: !isRecording ? 'not-allowed' : 'pointer'
          }}
        >
          Stop Recording
        </button>
      </div>

      {queuedHashes.length > 0 && isOnline && !isRecording && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#fff3e0',
          border: '2px solid #FF9800',
          borderRadius: '5px'
        }}>
          <p style={{ 
            margin: '0 0 10px 0',
            fontSize: '14px',
            color: '#e65100',
            fontWeight: 'bold'
          }}>
            ⚠️ You have {queuedHashes.length} hash(es) waiting to be uploaded
          </p>
          <button
            onClick={syncQueuedHashes}
            style={{
              padding: '12px 20px',
              fontSize: '15px',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              width: '100%',
              fontWeight: 'bold'
            }}
          >
            ⏫ Upload Now
          </button>
        </div>
      )}

      {isRecording && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fff3e0',
          border: '2px solid #FF9800',
          borderRadius: '5px',
          marginBottom: '20px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          🔴 Recording in progress... 
          <br/>
          <small>Creating 5-second chunks and uploading in real-time</small>
        </div>
      )}

      {chunkHashes.length > 0 && (
        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
          <h3>Generated Hashes:</h3>
          <div style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '15px', 
            borderRadius: '5px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {chunkHashes.map((item) => (
              <div 
                key={item.index}
                style={{ 
                  marginBottom: '10px',
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '3px',
                  borderLeft: '3px solid #2196F3'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  Chunk {item.index}
                </div>
                <div style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '11px',
                  wordBreak: 'break-all',
                  color: '#666'
                }}>
                  {item.hash}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recordedChunks.length > 0 && !isRecording && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={createVideoUrl}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              flex: 1
            }}
          >
            View Recorded Video ({recordedChunks.length} chunks)
          </button>
          
          <button
            onClick={downloadVideo}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              flex: 1
            }}
          >
            💾 Download Video
          </button>
        </div>
      )}

      {recordedVideoUrl && (
        <div style={{ marginTop: '20px' }}>
          <h3>Recorded Video:</h3>
          <div style={{ 
            backgroundColor: '#000', 
            borderRadius: '10px',
            overflow: 'hidden',
            aspectRatio: '16/9',
            marginBottom: '10px'
          }}>
            <video
              src={recordedVideoUrl}
              controls
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            />
          </div>
          <p style={{ color: '#666', fontSize: '14px' }}>
            Total size: {(recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0) / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}
    </div>
  );
}

export default CameraCapture;