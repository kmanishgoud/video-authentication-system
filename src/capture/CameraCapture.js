import React, { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { supabase } from "../supabaseClient";
import { v4 as uuidv4 } from "uuid";
import "./Capture.css";

const ffmpeg = new FFmpeg();

export default function CameraCapture() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);

  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [sessionId] = useState(uuidv4());
  const [ffmpegReady, setFfmpegReady] = useState(false);

  // -------------------------
  // CAMERA CONTROLS
  // -------------------------
  const openCamera = async () => {
    const s = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    videoRef.current.srcObject = s;
    setStream(s);
  };

  const closeCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    videoRef.current.srcObject = null;
    setStream(null);
  };

  // -------------------------
  // RECORDING
  // -------------------------
  const startRecording = () => {
    recordedChunks.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordedChunks.current, { type: "video/webm" });
      setVideoBlob(blob);

      // Store final hash reference (already working in your system)
      await supabase.from("video_sessions").insert({
        session_id: sessionId,
        final_hash: "generated_hash_here", // you already have this logic
      });
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // -------------------------
  // MP4 CONVERSION + DOWNLOAD
  // -------------------------
  const downloadMP4 = async () => {
    if (!videoBlob) return;

    if (!ffmpegReady) {
      await ffmpeg.load({
        coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js",
      });
      setFfmpegReady(true);
    }

    await ffmpeg.writeFile("input.webm", await fetchFile(videoBlob));
    await ffmpeg.exec([
      "-i",
      "input.webm",
      "-movflags",
      "+faststart",
      "-c:v",
      "libx264",
      "output.mp4",
    ]);

    const mp4Data = await ffmpeg.readFile("output.mp4");
    const mp4Blob = new Blob([mp4Data.buffer], { type: "video/mp4" });

    const url = URL.createObjectURL(mp4Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-${sessionId}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="capture-container">
      <video ref={videoRef} autoPlay playsInline muted />

      <div className="controls">
        <button onClick={openCamera} disabled={!!stream}>
          Open Camera
        </button>

        <button onClick={closeCamera} disabled={!stream}>
          Close Camera
        </button>

        <button onClick={startRecording} disabled={!stream || recording}>
          Start Recording
        </button>

        <button onClick={stopRecording} disabled={!recording}>
          Stop Recording
        </button>

        <button onClick={downloadMP4} disabled={!videoBlob}>
          Download MP4
        </button>
      </div>

      <p className="session-id">Session ID: {sessionId}</p>
    </div>
  );
}

