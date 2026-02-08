import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function FileHashUploader() {
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState('');
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle file selection
  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setHash('');
    setMessage('');
  };

  // Generate SHA-256 hash from file
  const generateFileHash = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        resolve(hashHex);
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  // Process file and upload hash to database
  const processAndUpload = async () => {
    if (!file) {
      setMessage('Please select a file first');
      return;
    }

    setIsProcessing(true);
    setMessage('Processing file...');

    try {
      // Generate hash
      const fileHash = await generateFileHash(file);
      setHash(fileHash);
      
      setMessage('Hash generated! Uploading to database...');

      // Generate session ID
      const sessionId = crypto.randomUUID();

      // Upload to Supabase
      const { data, error } = await supabase
        .from('video_hashes')
        .insert([
          {
            session_id: sessionId,
            chunk_index: 0,
            hash: fileHash
          }
        ]);

      if (error) {
        throw error;
      }

      setMessage('Success! Hash uploaded to database');

    } catch (error) {
      console.error('Error:', error);
      setMessage('Error: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h1>Video File Hash Uploader</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          Select Video File:
        </label>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          style={{ padding: '10px', fontSize: '16px' }}
        />
      </div>

      {file && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '10px', 
          backgroundColor: '#e8f5e9', 
          borderRadius: '5px' 
        }}>
          <strong>Selected File:</strong>
          <p>Name: {file.name}</p>
          <p>Size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <p>Type: {file.type}</p>
        </div>
      )}

      <button
        onClick={processAndUpload}
        disabled={!file || isProcessing}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: (!file || isProcessing) ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: (!file || isProcessing) ? 'not-allowed' : 'pointer'
        }}
      >
        {isProcessing ? 'Processing...' : 'Generate Hash & Upload'}
      </button>

      {message && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: message.includes('Error') ? '#ffebee' : '#e3f2fd',
          borderRadius: '5px' 
        }}>
          <p>{message}</p>
        </div>
      )}

      {hash && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '5px' 
        }}>
          <strong>Generated SHA-256 Hash:</strong>
          <p style={{ 
            wordBreak: 'break-all', 
            fontFamily: 'monospace', 
            fontSize: '14px',
            marginTop: '10px'
          }}>
            {hash}
          </p>
        </div>
      )}
    </div>
  );
}

export default FileHashUploader;