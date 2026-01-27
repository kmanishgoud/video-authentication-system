import React, { useState } from 'react';
import CameraCapture from './CameraCapture';
import VideoValidator from './VideoValidator';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('capture');

  return (
    <div className="App">
      {/* Tab Navigation */}
      <div style={{ 
        backgroundColor: '#2196F3', 
        padding: '0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          display: 'flex',
          gap: '0'
        }}>
          <button
            onClick={() => setActiveTab('capture')}
            style={{
              padding: '15px 30px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: activeTab === 'capture' ? 'white' : 'transparent',
              color: activeTab === 'capture' ? '#2196F3' : 'white',
              border: 'none',
              borderBottom: activeTab === 'capture' ? '3px solid #2196F3' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            📹 Mobile Capture
          </button>
          
          <button
            onClick={() => setActiveTab('validator')}
            style={{
              padding: '15px 30px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: activeTab === 'validator' ? 'white' : 'transparent',
              color: activeTab === 'validator' ? '#2196F3' : 'white',
              border: 'none',
              borderBottom: activeTab === 'validator' ? '3px solid #2196F3' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            🔍 Validator
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        {activeTab === 'capture' ? <CameraCapture /> : <VideoValidator />}
      </div>
    </div>
  );
}

export default App;