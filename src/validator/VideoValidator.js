import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Validator.css';

// ---------- helpers ----------
async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractSessionIdFromFilename(filename) {
  const match = filename.match(/recording-([a-f0-9-]{36})/i);
  return match ? match[1] : null;
}

async function sliceAndHashFile(file, sliceSize = 1024 * 1024) {
  const hashes = [];
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + sliceSize);
    hashes.push(await sha256(slice));
    offset += sliceSize;
  }
  return hashes;
}

function VideoValidator() {
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [result, setResult] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [error, setError] = useState('');

  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);
    setResult(null);
    setConfidence(null);
    setError('');

    const extracted = extractSessionIdFromFilename(f.name);
    if (extracted) {
      setSessionId(extracted);
      setAutoDetected(true);
    } else {
      setAutoDetected(false);
    }
  };

  const validate = async () => {
    setResult(null);
    setConfidence(null);
    setError('');

    if (!file || !sessionId) {
      setError('Missing video file or session ID');
      return;
    }

    // FULL MATCH
    const uploadedHash = await sha256(file);

    const { data: session } = await supabase
      .from('video_sessions')
      .select('final_hash')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!session) {
      setResult('UNKNOWN SESSION');
      return;
    }

    if (uploadedHash === session.final_hash) {
      setResult('AUTHENTIC (FULL MATCH)');
      setConfidence(100);
      return;
    }

    // PARTIAL MATCH
    const { data: chunks } = await supabase
      .from('video_hashes')
      .select('hash')
      .eq('session_id', sessionId);

    if (!chunks || chunks.length === 0) {
      setResult('FAKE');
      return;
    }

    const ledgerSet = new Set(chunks.map(c => c.hash));
    const sliceHashes = await sliceAndHashFile(file);

    let matches = 0;
    sliceHashes.forEach(h => {
      if (ledgerSet.has(h)) matches++;
    });

    const ratio = matches / sliceHashes.length;
    const percent = Math.round(ratio * 100);
    setConfidence(percent);

    if (ratio >= 0.9) {
      setResult('AUTHENTIC (PARTIAL MATCH)');
    } else if (ratio >= 0.4) {
      setResult('PARTIAL MATCH');
    } else {
      setResult('FAKE');
    }
  };

  return (
    <div className="validator-root">
      <div className="validator-card">
        <div className="validator-title">Video Validator</div>

        <input
          type="text"
          placeholder="Session ID"
          value={sessionId}
          disabled={autoDetected}
          onChange={(e) => setSessionId(e.target.value)}
        />

        <input type="file" accept="video/*" onChange={onFileChange} />

        <button onClick={validate}>Validate</button>

        <div className="status">
          {error && <div className="status-error">{error}</div>}

          {result && (
            <div
              className={
                result.includes('AUTHENTIC')
                  ? 'status-success'
                  : result.includes('PARTIAL')
                  ? 'status-warning'
                  : 'status-error'
              }
            >
              {result}
            </div>
          )}

          {confidence !== null && (
            <div className="confidence">
              Confidence: {confidence}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoValidator;
