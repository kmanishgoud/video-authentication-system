import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function VideoValidator() {
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    
    if (selectedFile) {
      if (selectedFile.type.startsWith('video/')) {
        setFile(selectedFile);
        setError('');
        setResult(null);
      } else {
        setError('Please select a valid video file');
      }
    }
  };

  // Generate SHA-256 hash from blob
  const generateHash = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hashHex;
  };

  // Process uploaded video into 5-second chunks
  const processVideoIntoChunks = async (videoFile) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.preload = 'metadata';
      video.src = URL.createObjectURL(videoFile);

      video.onloadedmetadata = async () => {
        try {
          const duration = video.duration;
          const chunkDuration = 5;
          const numChunks = Math.ceil(duration / chunkDuration);
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const chunks = [];
          const mediaRecorder = new MediaRecorder(canvas.captureStream());
          
          let chunkResolve;
          const chunkPromise = new Promise(resolve => {
            chunkResolve = resolve;
          });
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            chunkResolve();
          };

          for (let i = 0; i < numChunks; i++) {
            setProgress(`Processing chunk ${i + 1}/${numChunks}...`);
            
            const startTime = i * chunkDuration;
            const endTime = Math.min((i + 1) * chunkDuration, duration);
            const chunkLength = endTime - startTime;
            
            // Seek to start of chunk
            video.currentTime = startTime;
            await new Promise(resolve => {
              video.onseeked = resolve;
            });
            
            // Start recording and play
            mediaRecorder.start();
            video.play();
            
            // Record for chunk duration
            await new Promise(resolve => {
              setTimeout(resolve, chunkLength * 1000);
            });
            
            video.pause();
            mediaRecorder.stop();
            await chunkPromise;
            
            // Reset for next chunk
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };
          }
          
          URL.revokeObjectURL(video.src);
          resolve(chunks);
          
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };
    });
  };

  const validateVideo = async () => {
    if (!file || !sessionId.trim()) {
      setError('Please select a video file and enter session ID');
      return;
    }

    setIsProcessing(true);
    setError('');
    setResult(null);
    setProgress('Starting validation...');

    try {
      // Step 1: Process video into chunks
      setProgress('Splitting video into 5-second chunks...');
      const chunks = await processVideoIntoChunks(file);
      console.log(`📦 Created ${chunks.length} chunks from uploaded video`);

      // Step 2: Generate hashes for each chunk
      setProgress('Generating hashes...');
      const uploadHashes = [];
      
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Hashing chunk ${i + 1}/${chunks.length}...`);
        const hash = await generateHash(chunks[i]);
        uploadHashes.push({ index: i, hash });
        console.log(`🔐 Chunk ${i} hash:`, hash.substring(0, 16) + '...');
      }

      // Step 3: Fetch hashes from database
      setProgress('Fetching database records...');
      const { data: dbHashes, error: dbError } = await supabase
        .from('video_hashes')
        .select('*')
        .eq('session_id', sessionId.trim())
        .order('chunk_index', { ascending: true });

      if (dbError) throw dbError;

      if (!dbHashes || dbHashes.length === 0) {
        setResult({
          verdict: 'UNKNOWN',
          message: 'No matching session found in database',
          matchPercentage: 0
        });
        setIsProcessing(false);
        return;
      }

      // Step 4: Compare hashes
      setProgress('Comparing hashes...');
      let matchedChunks = 0;
      const comparison = [];
      
      for (let i = 0; i < uploadHashes.length; i++) {
        const uploadHash = uploadHashes[i].hash;
        const dbHash = dbHashes.find(h => h.chunk_index === i)?.hash;
        
        const matches = uploadHash === dbHash;
        if (matches) matchedChunks++;
        
        comparison.push({
          index: i,
          uploadHash: uploadHash.substring(0, 16) + '...',
          dbHash: dbHash ? dbHash.substring(0, 16) + '...' : 'MISSING',
          matches
        });
      }

      const matchPercentage = (matchedChunks / uploadHashes.length) * 100;

      // Step 5: Determine verdict
      let verdict, message;
      
      if (matchPercentage >= 80 && matchedChunks === uploadHashes.length) {
        verdict = 'AUTHENTIC';
        message = '✅ Video is AUTHENTIC - All hashes match perfectly!';
      } else if (matchPercentage >= 60) {
        verdict = 'SUSPICIOUS';
        message = '⚠️ Video is SUSPICIOUS - Some chunks don\'t match';
      } else {
        verdict = 'FAKE';
        message = '❌ Video is FAKE - Hash mismatch detected';
      }

      setResult({
        verdict,
        message,
        matchPercentage: matchPercentage.toFixed(2),
        totalChunks: uploadHashes.length,
        matchedChunks,
        comparison
      });

      setProgress('Validation complete!');

    } catch (err) {
      console.error('Validation error:', err);
      setError('Validation failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getVerdictColor = (verdict) => {
    switch (verdict) {
      case 'AUTHENTIC': return { bg: '#e8f5e9', border: '#4CAF50', text: '#2e7d32' };
      case 'SUSPICIOUS': return { bg: '#fff3e0', border: '#FF9800', text: '#e65100' };
      case 'FAKE': return { bg: '#ffebee', border: '#f44336', text: '#c62828' };
      default: return { bg: '#f5f5f5', border: '#9e9e9e', text: '#616161' };
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Video Validator</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Verify video authenticity for insurance claims and legal evidence
      </p>

      {/* Input Section */}
      <div style={{ 
        backgroundColor: '#f9f9f9', 
        padding: '20px', 
        borderRadius: '10px',
        marginBottom: '20px'
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
            Session ID (from mobile app):
          </label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Paste session ID here"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              border: '2px solid #ddd',
              borderRadius: '5px',
              fontFamily: 'monospace'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
            Select Video File:
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{
              padding: '10px',
              fontSize: '14px',
              border: '2px solid #ddd',
              borderRadius: '5px',
              width: '100%'
            }}
          />
          {file && (
            <p style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <button
          onClick={validateVideo}
          disabled={!file || !sessionId || isProcessing}
          style={{
            padding: '12px 30px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: (!file || !sessionId || isProcessing) ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (!file || !sessionId || isProcessing) ? 'not-allowed' : 'pointer',
            width: '100%'
          }}
        >
          {isProcessing ? 'Validating...' : 'Validate Video'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#ffebee',
          border: '2px solid #f44336',
          borderRadius: '5px',
          color: '#c62828',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div style={{
          padding: '15px',
          backgroundColor: '#e3f2fd',
          border: '2px solid #2196F3',
          borderRadius: '5px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{progress}</div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: '#bbdefb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#2196F3',
              animation: 'progress 1.5s ease-in-out infinite'
            }} />
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          padding: '20px',
          backgroundColor: getVerdictColor(result.verdict).bg,
          border: `3px solid ${getVerdictColor(result.verdict).border}`,
          borderRadius: '10px',
          marginBottom: '20px'
        }}>
          <h2 style={{ 
            color: getVerdictColor(result.verdict).text,
            marginBottom: '10px',
            fontSize: '32px'
          }}>
            {result.verdict}
          </h2>
          <p style={{ 
            fontSize: '16px',
            color: getVerdictColor(result.verdict).text,
            marginBottom: '20px'
          }}>
            {result.message}
          </p>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              backgroundColor: 'white', 
              padding: '15px', 
              borderRadius: '5px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                Match Percentage
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: getVerdictColor(result.verdict).border }}>
                {result.matchPercentage}%
              </div>
            </div>

            <div style={{ 
              backgroundColor: 'white', 
              padding: '15px', 
              borderRadius: '5px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                Matched Chunks
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                {result.matchedChunks}/{result.totalChunks}
              </div>
            </div>
          </div>

          {/* Detailed Comparison */}
          {result.comparison && result.comparison.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ marginBottom: '10px' }}>Chunk Comparison:</h3>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                backgroundColor: 'white',
                padding: '10px',
                borderRadius: '5px'
              }}>
                {result.comparison.map((comp) => (
                  <div 
                    key={comp.index}
                    style={{
                      padding: '10px',
                      marginBottom: '8px',
                      backgroundColor: comp.matches ? '#e8f5e9' : '#ffebee',
                      borderLeft: `4px solid ${comp.matches ? '#4CAF50' : '#f44336'}`,
                      borderRadius: '3px'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                      Chunk {comp.index} {comp.matches ? '✓' : '✗'}
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#666' }}>
                      Upload: {comp.uploadHash}<br/>
                      Database: {comp.dbHash}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export default VideoValidator;