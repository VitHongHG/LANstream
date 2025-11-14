
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Role } from './types';
import { VideoPlayer } from './components/VideoPlayer';
import { CameraIcon, SignalIcon, CopyIcon, LinkIcon, XCircleIcon } from './components/Icons';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Select your role to begin.');

  const [offerSdp, setOfferSdp] = useState('');
  const [answerSdp, setAnswerSdp] = useState('');
  const [tempAnswerSdp, setTempAnswerSdp] = useState('');
  const [tempOfferSdp, setTempOfferSdp] = useState('');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const setupStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices.', error);
      setStatus('Error: Could not access camera or microphone. Please check permissions.');
      return null;
    }
  }, []);
  
  const createPeerConnection = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // In this manual setup, ICE candidates are included in the SDP.
        // We can re-generate the offer/answer if needed, but it's often handled automatically.
        console.log('Got ICE candidate');
        if (pc.localDescription) {
            if (role === 'broadcaster') setOfferSdp(JSON.stringify(pc.localDescription));
            else setAnswerSdp(JSON.stringify(pc.localDescription));
        }
      }
    };

    pc.ontrack = (event) => {
      console.log('Remote track received');
      setRemoteStream(event.streams[0]);
    };

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            setIsConnected(true);
            setStatus('Connection established successfully!');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setIsConnected(false);
            setRemoteStream(null);
            setStatus('Connection lost. Please try again.');
        }
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, [role]);

  const handleRoleSelect = async (selectedRole: Role) => {
    setRole(selectedRole);
    setStatus('Initializing camera...');
    await setupStream();
    setStatus('Ready.');
  };

  const handleCreateOffer = async () => {
    if (!localStream) {
        setStatus('Cannot create offer: local stream is not available.');
        return;
    }
    setStatus('Creating offer...');
    const pc = createPeerConnection(localStream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setOfferSdp(JSON.stringify(offer));
    setStatus('Offer created. Share it with the viewer.');
  };
  
  const handleCreateAnswer = async () => {
    if (!localStream || !tempOfferSdp) {
        setStatus('Cannot create answer: local stream or offer SDP is missing.');
        return;
    }
    setStatus('Creating answer...');
    try {
        const pc = createPeerConnection(localStream);
        const offer = JSON.parse(tempOfferSdp);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setAnswerSdp(JSON.stringify(answer));
        setStatus('Answer created. Share it back with the broadcaster.');
    } catch (e) {
        console.error("Failed to create answer:", e);
        setStatus("Error: Invalid offer SDP provided. Please check the value.");
    }
  };

  const handleAddAnswer = async () => {
    if (!peerConnectionRef.current || !tempAnswerSdp) {
        setStatus('Cannot connect: peer connection or answer SDP is missing.');
        return;
    }
    setStatus('Connecting...');
    try {
        const answer = JSON.parse(tempAnswerSdp);
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch(e) {
        console.error("Failed to add answer:", e);
        setStatus("Error: Invalid answer SDP provided. Please check the value.");
    }
  };

  const resetConnection = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setRole(null);
    setOfferSdp('');
    setAnswerSdp('');
    setTempOfferSdp('');
    setTempAnswerSdp('');
    setStatus('Select your role to begin.');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerConnectionRef.current?.close();
      localStream?.getTracks().forEach(track => track.stop());
    };
  }, [localStream]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setStatus('Copied to clipboard!');
      setTimeout(() => setStatus('Ready.'), 2000);
    }, (err) => {
      console.error('Could not copy text: ', err);
      setStatus('Failed to copy.');
    });
  };

  const renderContent = () => {
    if (!role) {
      return (
        <div className="flex flex-col sm:flex-row gap-6">
          <button onClick={() => handleRoleSelect('broadcaster')} className="flex flex-col items-center justify-center gap-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-8 px-12 rounded-lg transition-transform transform hover:scale-105 shadow-lg">
            <SignalIcon className="w-16 h-16" />
            <span className="text-2xl">Start Broadcasting</span>
          </button>
          <button onClick={() => handleRoleSelect('viewer')} className="flex flex-col items-center justify-center gap-4 bg-green-600 hover:bg-green-700 text-white font-bold py-8 px-12 rounded-lg transition-transform transform hover:scale-105 shadow-lg">
            <CameraIcon className="w-16 h-16" />
            <span className="text-2xl">Join Stream</span>
          </button>
        </div>
      );
    }

    return (
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-center capitalize">{role}</h2>
            <div className="relative aspect-video bg-gray-800 rounded-lg shadow-inner overflow-hidden">
                <VideoPlayer stream={localStream} muted={true} />
                <span className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 text-sm rounded">Your Camera</span>
            </div>
            {isConnected && (
                 <div className="relative aspect-video bg-gray-800 rounded-lg shadow-inner overflow-hidden">
                    <VideoPlayer stream={remoteStream} />
                    <span className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 text-sm rounded">Remote Stream</span>
                </div>
            )}
        </div>
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col gap-4">
            <h2 className="text-2xl font-bold border-b border-gray-700 pb-2">Connection Steps</h2>
            {role === 'broadcaster' && (
                <>
                    {!offerSdp && <button onClick={handleCreateOffer} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition flex items-center justify-center gap-2"><LinkIcon className="w-5 h-5" /> Generate Offer</button>}
                    {offerSdp && (
                        <div className="flex flex-col gap-2">
                            <label className="font-semibold text-gray-300">1. Send this Offer to the Viewer:</label>
                            <div className="relative">
                                <textarea readOnly value={offerSdp} className="w-full h-32 p-2 bg-gray-900 text-gray-300 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs" />
                                <button onClick={() => copyToClipboard(offerSdp)} className="absolute top-2 right-2 p-1 bg-gray-700 hover:bg-gray-600 rounded"><CopyIcon className="w-5 h-5" /></button>
                            </div>
                        </div>
                    )}
                    {offerSdp && !isConnected && (
                         <div className="flex flex-col gap-2">
                            <label className="font-semibold text-gray-300">2. Paste Viewer's Answer here:</label>
                             <textarea value={tempAnswerSdp} onChange={e => setTempAnswerSdp(e.target.value)} placeholder="Paste SDP answer here..." className="w-full h-32 p-2 bg-gray-900 text-gray-300 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs" />
                             <button onClick={handleAddAnswer} disabled={!tempAnswerSdp} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"><LinkIcon className="w-5 h-5"/> Connect</button>
                         </div>
                    )}
                </>
            )}
            {role === 'viewer' && (
                <>
                    {!answerSdp && (
                        <div className="flex flex-col gap-2">
                            <label className="font-semibold text-gray-300">1. Paste Broadcaster's Offer here:</label>
                            <textarea value={tempOfferSdp} onChange={e => setTempOfferSdp(e.target.value)} placeholder="Paste SDP offer here..." className="w-full h-32 p-2 bg-gray-900 text-gray-300 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs" />
                            <button onClick={handleCreateAnswer} disabled={!tempOfferSdp} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"><LinkIcon className="w-5 h-5"/> Generate Answer</button>
                        </div>
                    )}
                    {answerSdp && (
                        <div className="flex flex-col gap-2">
                            <label className="font-semibold text-gray-300">2. Send this Answer to the Broadcaster:</label>
                             <div className="relative">
                                <textarea readOnly value={answerSdp} className="w-full h-32 p-2 bg-gray-900 text-gray-300 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs" />
                                <button onClick={() => copyToClipboard(answerSdp)} className="absolute top-2 right-2 p-1 bg-gray-700 hover:bg-gray-600 rounded"><CopyIcon className="w-5 h-5" /></button>
                            </div>
                            <p className="text-sm text-gray-400">Waiting for broadcaster to connect...</p>
                        </div>
                    )}
                </>
            )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400 mb-2">
          LAN Video Streamer
        </h1>
        <p className="text-lg text-gray-400">Peer-to-peer video streaming over your local network with WebRTC.</p>
        <div className="mt-4 bg-gray-800 inline-block px-4 py-2 rounded-lg shadow-md">
            <p className="text-gray-300">Status: <span className="font-semibold text-teal-400">{status}</span></p>
        </div>
      </div>

      <main className="w-full flex-grow flex items-center justify-center">
        {renderContent()}
      </main>
      
      {role && (
          <button 
            onClick={resetConnection} 
            className="mt-8 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg">
            <XCircleIcon className="w-5 h-5" />
            Reset and End Session
          </button>
      )}
    </div>
  );
}
