import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import CameraCapture from './capture/CameraCapture';
import VideoValidator from './validator/VideoValidator';

function App() {
  return (
    <Routes>
      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/capture" />} />

      {/* Mobile Capture App */}
      <Route path="/capture" element={<CameraCapture />} />

      {/* Validator App */}
      <Route path="/validator" element={<VideoValidator />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/capture" />} />
    </Routes>
  );
}

export default App;
