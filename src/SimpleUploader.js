import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function SimpleUploader() {
  const [message, setMessage] = useState('');

  const uploadTestHash = async () => {
    setMessage('Uploading...');
    
    // Generate random session ID
    const sessionId = crypto.randomUUID();
    
    // Fake hash (we'll make real ones later)
    const testHash = 'abc123def456';
    
    // Upload to Supabase
    const { data, error } = await supabase
      .from('video_hashes')
      .insert([
        {
          session_id: sessionId,
          chunk_index: 0,
          hash: testHash
        }
      ]);
    
    if (error) {
      setMessage('Error: ' + error.message);
      console.error(error);
    } else {
      setMessage('Success! Hash uploaded to database');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Simple Database Upload Test</h1>
      <button onClick={uploadTestHash}>
        Upload Test Hash
      </button>
      <p>{message}</p>
    </div>
  );
}

export default SimpleUploader;