import React, { useState, useRef, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import { gapi } from 'gapi-script';
import './App.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES = process.env.REACT_APP_GOOGLE_SCOPE;

function App() {
  const [capturedImage, setCapturedImage] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState('1');
  const [selectedType, setSelectedType] = useState('Classroom');
  const [selectedDescription, setSelectedDescription] = useState('Clean');
  const [facingMode, setFacingMode] = useState('environment');
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    city: '',
    country: '',
    street: '',
    houseNumber: '',
    timestamp: '',
  });
  const webcamRef = useRef(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [googleAuthReady, setGoogleAuthReady] = useState(false);
  const authInstanceRef = useRef(null);

  useEffect(() => {
    function start() {
      gapi.client
        .init({
          clientId: CLIENT_ID,
          scope: SCOPES,
        })
        .then(() => {
          const authInstance = gapi.auth2.getAuthInstance();
          authInstanceRef.current = authInstance;
          setIsAuthorized(authInstance.isSignedIn.get());
          authInstance.isSignedIn.listen(setIsAuthorized);
          setGoogleAuthReady(true);
        })
        .catch((error) => {
          console.error('Error loading GAPI:', error);
        });
    }

    gapi.load('client:auth2', start);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const timestamp = new Date().toLocaleString();
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();

          setLocation({
            latitude,
            longitude,
            city: data.address?.city || '',
            country: data.address?.country || '',
            street: data.address?.road || '',
            houseNumber: data.address?.house_number || 'Not available',
            timestamp,
          });
        } catch (error) {
          console.error('Error fetching location:', error);
          setLocation({
            latitude,
            longitude,
            city: '',
            country: '',
            street: '',
            houseNumber: 'Not available',
            timestamp,
          });
        }
      });
    }
  }, []);

  const signIn = () => {
    if (authInstanceRef.current) {
      authInstanceRef.current.signIn({ prompt: 'consent' }).then(() => {
        setIsAuthorized(true);
      });
    } else {
      toast.warn('Google Auth not initialized yet. Please try again.');
    }
  };

  const captureImage = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
    } else {
      toast.error('Failed to capture image. Please try again.');
    }
  };

  // Function to adjust brightness of the image using canvas
  const adjustImageBrightness = (imageSrc, brightness) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the image to canvas
        ctx.drawImage(img, 0, 0);

        // Apply brightness filter
        ctx.filter = `brightness(${brightness})`;
        ctx.drawImage(img, 0, 0);

        // Get the modified image
        const modifiedImage = canvas.toDataURL('image/jpeg');
        resolve(modifiedImage);
      };
      img.onerror = (error) => {
        reject(error);
      };
    });
  };

  const sendEmail = async () => {
    if (!capturedImage) {
      toast.warn('No image captured. Please take a picture first.');
      return;
    }

    // Adjust brightness of the image before adding to PDF
    const brightness = 1.8; // Example brightness level (can be adjusted)
    const brightImage = await adjustImageBrightness(capturedImage, brightness);

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: [1920, 1080],
    });

    // Add the adjusted image to the PDF
    pdf.addImage(brightImage, 'JPEG', 0, 0, 1920, 1080);

    // Add overlay text
    pdf.setTextColor(178,34,34); // red text
    pdf.setFontSize(30);
    const overlayYStart = 50;
    const lineSpacing = 30;
    const leftMargin = 50;

    const lines = [
      `Latitude: ${location.latitude}`,
      `Longitude: ${location.longitude}`,
      `City: ${location.city}`,
      `Street: ${location.street}`,
      `House Number: ${location.houseNumber}`,
      `Floor: ${selectedFloor}`,
      `Type: ${selectedType}`,
      `Description: ${selectedDescription}`,
      `Date & Time: ${location.timestamp}`,
      // `Country: ${location.country}`,
    ];

    lines.forEach((line, index) => {
      pdf.text(line, leftMargin, overlayYStart + index * lineSpacing);
    });

    const pdfBlob = pdf.output('blob');
    const reader = new FileReader();
    reader.readAsDataURL(pdfBlob);
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      sendGmail(base64data);
    };
  };

  const sendGmail = async (base64data) => {
    const accessToken = gapi.auth.getToken()?.access_token;

    if (!accessToken) {
      toast.warn('Not authorized. Please sign in again.');
      return;
    }

    const emailContent = [
      `To: ${process.env.REACT_APP_EMAIL_TO}`,
      `Cc: ${process.env.REACT_APP_EMAIL_CC}`,
      'Subject: Captured Image and Details',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary=boundary',
      '',
      '--boundary',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Here is the captured image and details.',
      '--boundary',
      'Content-Type: application/pdf; name=captured-image.pdf',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename=captured-image.pdf',
      '',
      base64data,
      '--boundary--',
    ].join('\n');

    const base64EncodedEmail = btoa(emailContent)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: base64EncodedEmail,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        console.error('Error response from Gmail API:', errData);
        throw new Error(errData.error?.message || 'Failed to send email');
      }

      toast.success('Email sent successfully!');
    } catch (error) {
      toast.error('Failed to send email. See console for details.');
    }
  };

  return (
    <div className="App">
      <h1 className="app-title">
        <span role="img" aria-label="building">🏢</span>{' '}
        <span style={{ color: 'black' }}>CAPITAL </span>{' '}
        <span style={{ color: '#c4aa6a' }}>INFRADIENST</span>
      </h1>

      {!isAuthorized && (
        <button
          onClick={signIn}
          className="google-signin-btn"
          disabled={!googleAuthReady}
        >
          {googleAuthReady ? 'Sign in with Google' : 'Initializing...'}
        </button>
      )}

      <div className="camera-selector">
        <select
          id="cameraSelect"
          value={facingMode}
          onChange={(e) => setFacingMode(e.target.value)}
          className="styled-select"
        >
          <option value="user">Front Camera</option>
          <option value="environment">Back Camera</option>
        </select>
      </div>

      <div className="camera-layout">
        <div className="camera-container">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="webcam"
            videoConstraints={{ facingMode }}
          />
        </div>

        <div className="dropdown-container">
          <label>Floor:</label>
          <select value={selectedFloor} onChange={(e) => setSelectedFloor(e.target.value)}>
            {[...Array(50)].map((_, i) => (
              <option key={i} value={i + 1}>{i + 1}</option>
            ))}
          </select>

          <label>Type:</label>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="Classroom">Classroom</option>
            <option value="Floor">Floor</option>
            <option value="Restroom">Restroom</option>
            <option value="Stairs">Stairs</option>
          </select>

          <label>Description:</label>
          <select value={selectedDescription} onChange={(e) => setSelectedDescription(e.target.value)}>
            <option value="Clean">Clean</option>
            <option value="Dirty">Dirty</option>
          </select>
        </div>
      </div>

      <ToastContainer position="bottom-right" autoClose={3000} />

      <button onClick={captureImage} className="capture-btn">
        Capture Image
      </button>

      {capturedImage && (
        <div className="captured-image-container">
          <div className="captured-image">
            <img src={capturedImage} alt="Captured" />
            <div className="image-overlay">
              <p>Latitude: {location.latitude}</p>
              <p>Longitude: {location.longitude}</p>
              <p>City: {location.city}</p>
              <p>Street: {location.street}</p>
              <p>House Number: {location.houseNumber}</p>
              <p>Floor: {selectedFloor}</p>
              <p>Type: {selectedType}</p>
              <p>Description: {selectedDescription}</p>
            </div>
          </div>
          <button onClick={sendEmail} className="email-btn">
            Send Email
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
