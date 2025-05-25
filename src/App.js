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
  const [capturedImages, setCapturedImages] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState('1');
  const [selectedType, setSelectedType] = useState('Classroom');
  const [selectedDescription, setSelectedDescription] = useState('Clean');
  const [reporterName, setReporterName] = useState('');
  const [facilityName, setfacilityName] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    city: '',
    country: '',
    street: '',
    landmark: '',
    zipcode: '',
    houseNumber: '',
    timestamp: '',
  });
  const [pdfPreview, setPdfPreview] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const webcamRef = useRef(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [googleAuthReady, setGoogleAuthReady] = useState(false);
  const authInstanceRef = useRef(null);

  useEffect(() => {
    function start() {
      gapi.client
        .init({ clientId: CLIENT_ID, scope: SCOPES })
        .then(() => {
          const authInstance = gapi.auth2.getAuthInstance();
          authInstanceRef.current = authInstance;
          setIsAuthorized(authInstance.isSignedIn.get());
          authInstance.isSignedIn.listen(setIsAuthorized);
          setGoogleAuthReady(true);
        })
        .catch((error) => {
          toast.error('Error loading GAPI');
          console.error(error);
        });
    }

    gapi.load('client:auth2', start);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const timestamp = new Date().toLocaleString();
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.status === 'OK' && data.results.length > 0) {
            const addressComponents = data.results[0].address_components;
            const getAddressComponent = (types) =>
              addressComponents.find((comp) =>
                types.every((type) => comp.types.includes(type))
              )?.long_name || '';
            const landmark =
              getAddressComponent(['point_of_interest']) ||
              getAddressComponent(['premise']) ||
              getAddressComponent(['establishment']) ||
              'Not available';
            const zipcode = getAddressComponent(['postal_code']) || '';

            setLocation({
              latitude,
              longitude,
              city: getAddressComponent(['locality']),
              country: getAddressComponent(['country']),
              street: getAddressComponent(['route']),
              houseNumber: getAddressComponent(['street_number']) || 'Not available',
              zipcode,
              timestamp,
              landmark,
            });
          } else {
            toast.warn('No address found from Google Geocoding');
          }
        } catch (error) {
          toast.error('Error fetching location');
          console.error(error);
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
      toast.warn('Google Auth not initialized yet.');
    }
  };

  const captureImage = () => {
    // if (!reporterName.trim()) {
    //   toast.warn('Please enter reporter name.');
    //   return;
    // }
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImages((prev) => [...prev, imageSrc]);
    } else {
      toast.error('Failed to capture image.');
    }
  };

  const removeImage = (index) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const adjustImageBrightness = (imageSrc, brightness) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        ctx.filter = `brightness(${brightness})`;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.onerror = (error) => reject(error);
    });
  };

const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (error) => reject(error);
    img.src = url;
  });
};

const generatePdf = async () => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1920, 1180] });

  // First Page: Facility Header + Logo + Reporter Footer
  const logoBase64 = await getBase64ImageFromURL('use.png');

  // Header - Facility Name
  pdf.setFontSize(60);
  pdf.setFont("helvetica", "bold");
  const titleText = facilityName;
  const titleWidth = pdf.getTextWidth(titleText);
  pdf.text(titleText, (1920 - titleWidth) / 2, 100);

  // Logo
  const logoWidth = 1200;
  const logoHeight = 900;
  const logoX = (1920 - logoWidth) / 2;
  const logoY = 150;
  pdf.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

  // Footer - Reporter Name
  pdf.setFontSize(70);
  pdf.setFont("helvetica", "normal");
  const reporter = `${reporterName || 'N/A'}`;
  const reporterWidth = pdf.getTextWidth(reporter);
  pdf.text(reporter, (1920 - reporterWidth) / 2, 1150);

  // Captured Images Pages
  for (let i = 0; i < capturedImages.length; i++) {
    pdf.addPage();

    const brightImage = await adjustImageBrightness(capturedImages[i], 1.6);
    const imageWidth = 1920;
    const imageHeight = 900;

    pdf.addImage(brightImage, 'JPEG', 0, 0, imageWidth, imageHeight);

    // Top-right Metadata
    const topRightLines = [
      `Latitude: ${location.latitude}`,
      `Longitude: ${location.longitude}`,
      `Zipcode: ${location.zipcode}`,
      `Date & Time: ${location.timestamp}`,
      `Floor: ${selectedFloor}`,
      `Type: ${selectedType}`,
      `Description: ${selectedDescription}`,
      `Street: ${location.street}`,
      `City: ${location.city}`,
      `Country: ${location.country}`
    ];

    const topRightFontSize = 24;
    const topRightMargin = 50;
    const topStartY = 60;
    pdf.setFontSize(topRightFontSize);
    pdf.setTextColor(0, 0, 0);

    topRightLines.forEach((line, idx) => {
      const textWidth = pdf.getTextWidth(line);
      const x = imageWidth - textWidth - topRightMargin;
      const y = topStartY + idx * (topRightFontSize + 10);
      pdf.text(line, x, y);
    });

    // Footer with Street (Left-aligned)
    pdf.setFontSize(60);
    const locationFooter = `${location.street}`;
    const footerWidth = pdf.getTextWidth(locationFooter);
    pdf.text(locationFooter, 50,1150);
  }

  return pdf;
};




  const previewPdf = async () => {
    const pdf = await generatePdf();
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setPdfPreview(url);
    setIsModalOpen(true);
  };

  const sendEmail = async () => {
    if (capturedImages.length === 0) {
      toast.warn('No images captured.');
      return;
    }
    const pdf = await generatePdf();
    const pdfBlob = pdf.output('blob');
    const reader = new FileReader();
    reader.readAsDataURL(pdfBlob);
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      sendGmail(base64data);
    };
  };

  const sendGmail = async (base64data) => {
    const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
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
      `Here is the captured image and details from reporter: ${reporterName || 'N/A'}.`,
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
        body: JSON.stringify({ raw: base64EncodedEmail }),
      });

      if (!response.ok) throw new Error('Failed to send email');
      toast.success('Email sent successfully!');
    } catch (error) {
      toast.error('Failed to send email');
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
        <button onClick={signIn} className="google-signin-btn" disabled={!googleAuthReady}>
          {googleAuthReady ? 'Sign in with Google' : 'Initializing...'}
        </button>
      )}

      <div className="camera-selector">
        <select value={facingMode} onChange={(e) => setFacingMode(e.target.value)} className="styled-select">
          <option value="user">Front Camera</option>
          <option value="environment">Back Camera</option>
        </select>
      </div>

      <div className="camera-layout">
        <div className="camera-container" style={{ position: 'relative' }}>
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="webcam"
            videoConstraints={{ facingMode }}
          />
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '200px',
            zIndex: 1,
          }}>
            <div><strong>Lat:</strong> {location.latitude?.toFixed(5)}</div>
            <div><strong>Lng:</strong> {location.longitude?.toFixed(5)}</div>
            <div><strong>City:</strong> {location.city}</div>
            <div><strong>Street:</strong> {location.street}</div>
            <div><strong>Landmark:</strong> {location.landmark}</div>
            <div><strong>Zipcode:</strong> {location.zipcode}</div>
            <div><strong>Time:</strong> {location.timestamp}</div>
          </div>
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

          <label>Reporter:</label>
          <input
            type="text"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Enter reporter's name"
            style={{ padding: '8px', marginBottom: '10px', width: '100%' }}
          />
           <label>Name of Facility:</label>
          <input
            type="text"
            value={facilityName}
            onChange={(e) => setfacilityName(e.target.value)}
            placeholder="Enter Name of facility"
            style={{ padding: '8px', marginBottom: '10px', width: '100%' }}
          />
        </div>
      </div>

      <ToastContainer position="bottom-right" autoClose={3000} />

      <button onClick={captureImage} className="capture-btn">Capture Image</button>

      {capturedImages.length > 0 && (
        <div className="captured-image-container">
          <div className="captured-image" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {capturedImages.map((img, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                <img src={img} alt={`Captured ${idx}`} style={{ maxWidth: '150px' }} />
                <button
                  onClick={() => removeImage(idx)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: 'red',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button onClick={previewPdf} className="email-btn">Preview PDF</button>
          <br /><br />
          <button onClick={sendEmail} className="email-btn">Send Email</button>
        </div>
      )}

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0,
          width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff', padding: '10px', borderRadius: '8px',
            maxWidth: '90%', maxHeight: '90%', overflow: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: 'absolute', top: 20, right: 20,
                background: 'red', color: 'white', border: 'none',
                fontSize: '20px', cursor: 'pointer'
              }}
            >
              X
            </button>
            <iframe src={pdfPreview} title="PDF Preview" style={{ width: '900px', height: '90vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
