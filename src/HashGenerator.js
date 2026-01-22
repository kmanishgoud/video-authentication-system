import React, { useState } from 'react';

function HashGenerator() {
  const [inputText, setInputText] = useState('');
  const [hash, setHash] = useState('');

  const generateHash = async () => {
    // Step 1: Convert text to binary
    const encoder = new TextEncoder();
    const data = encoder.encode(inputText);
    
    // Step 2: Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Step 3: Convert binary hash to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Step 4: Store the hash
    setHash(hashHex);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h1>SHA-256 Hash Generator</h1>
      
      <div style={{ marginBottom: '10px' }}>
        <label>Enter text to hash:</label>
        <br />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ width: '100%', padding: '8px', fontSize: '16px' }}
          placeholder="Type something..."
        />
      </div>
      
      <button 
        onClick={generateHash} 
        style={{ padding: '10px 20px', fontSize: '16px' }}
      >
        Generate Hash
      </button>
      
      {hash && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#f0f0f0', 
          borderRadius: '5px' 
        }}>
          <strong>SHA-256 Hash:</strong>
          <p style={{ 
            wordBreak: 'break-all', 
            fontFamily: 'monospace', 
            fontSize: '14px' 
          }}>
            {hash}
          </p>
        </div>
      )}
    </div>
  );
}

export default HashGenerator;