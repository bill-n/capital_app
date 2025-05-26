import React, { useState, useRef, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import { gapi } from 'gapi-script';
import './App.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES = process.env.REACT_APP_GOOGLE_SCOPE;


function App() {
  const [isSending, setIsSending] = useState(false);

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
  const totalPages = capturedImages.length + 1; // 1 for the cover page

  // First Page: Capital Image Template + Logo + Reporter Footer
  const capital_image_template = await getBase64ImageFromURL('capital_image_template.png');
  const capital_image_logo = await getBase64ImageFromURL('capital_image_logo.png');

  // Header - Facility Name
  pdf.setFontSize(60);
  pdf.setFont("helvetica", "normal");
  const titleText = facilityName;
  pdf.text(titleText, 50, 100);

  // Capital Infradienst Image Template
  const logoWidth = 1200;
  const logoHeight = 900;
  const logoX = (1920 - logoWidth) / 2;
  const logoY = 150;
  pdf.addImage(capital_image_template, 'PNG', logoX, logoY, logoWidth, logoHeight);

  // Footer - Reporter Name
  pdf.setFontSize(36);
  pdf.setFont("helvetica", "normal");
  const reporter = `${reporterName}`;
  pdf.text(reporter, 150, 1150);

  // Page number for the first page (cover)
  pdf.setFontSize(24);
  pdf.setTextColor(100, 100, 100);
  const firstPageNumber = `Page 1 of ${totalPages}`;
  const firstPageNumberWidth = pdf.getTextWidth(firstPageNumber);
  pdf.text(firstPageNumber, 1920 - firstPageNumberWidth - 50, 1150); // bottom-right

  // Captured Images Pages
  for (let i = 0; i < capturedImages.length; i++) {
    pdf.addPage();

    // HEADER for pages after the first
    const headerLogoWidth = 60;
    const headerLogoHeight = 60;
    const headerLogoX = 50;
    const headerLogoY = 40;

    const headerTextX = headerLogoX + headerLogoWidth + 20;
    const headerTextY = headerLogoY + headerLogoHeight / 2 + 10;

    // Draw logo
    pdf.addImage(capital_image_logo, 'PNG', headerLogoX, headerLogoY, headerLogoWidth, headerLogoHeight);

    // Facility name as header
    pdf.setFontSize(36);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(facilityName, headerTextX, headerTextY);

    // Underline
    const underlineY = headerLogoY + headerLogoHeight + 10;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1); // thin
    pdf.line(40, underlineY, 1880, underlineY);

    // ====== BODY CONTENT BELOW HEADER ======
    const verticalOffset = underlineY + 20; // enough space below underline

    const brightImage = await adjustImageBrightness(capturedImages[i], 1.6);
    const imageWidth = 900;
    const imageHeight = 900;
    const margin = 150;
    const imageMarginLeft = 320; // <-- Increased left margin here

    // Image on the left with increased margin
    pdf.addImage(brightImage, 'JPEG', imageMarginLeft, verticalOffset, imageWidth, imageHeight);

    // Description next to the image (adjust X to new margin)
    const descriptionText = selectedDescription || "No description provided";
    pdf.setFontSize(36);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(50, 50, 50);

    const descLines = pdf.splitTextToSize(descriptionText, 850);
    const lineHeight = 36 * 1.2;
    const descHeight = descLines.length * lineHeight;
    const descriptionY = verticalOffset + (imageHeight / 2) - (descHeight / 2);
    const descriptionX = imageMarginLeft + imageWidth + margin;
    pdf.text(descLines, descriptionX, descriptionY);

    // Metadata at top right of image (adjust X for margin)
    const topRightLines = [
      `Latitude: ${location.latitude}`,
      `Longitude: ${location.longitude}`,
      `Zipcode: ${location.zipcode}`,
      `Date & Time: ${location.timestamp}`,
      `Floor: ${selectedFloor}`,
      `Type: ${selectedType}`,
      `Street: ${location.street}`,
      `House Number: ${location.houseNumber}`,
      `City: ${location.city}`,
      `Country: ${location.country}`
    ];

    const topRightFontSize = 24;
    const topRightMargin = 20;
    const topStartY = verticalOffset + 30;

    pdf.setFontSize(topRightFontSize);
    pdf.setTextColor(255,255,255);

    topRightLines.forEach((line, idx) => {
      const textWidth = pdf.getTextWidth(line);
      const x = imageMarginLeft + imageWidth - textWidth - topRightMargin;
      const y = topStartY + idx * (topRightFontSize + 6);
      pdf.text(line, x, y);
    });

    // Footer line and address
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1);
    pdf.line(30, 1100, 1000, 1100);

    pdf.setFontSize(24);
    const locationFooter = `${location.street + ',' || ''} ${location.houseNumber || ''} ${location.zipcode || ''} ${location.city || ''}`.trim();
    pdf.text(locationFooter, 50, 1150);

    // Page number
    const pageNum = i + 2; // page 1 is the cover
    const pageText = `Page ${pageNum} of ${totalPages}`;
    const pageTextWidth = pdf.getTextWidth(pageText);
    pdf.setFontSize(24);
    pdf.setTextColor(100, 100, 100);
    pdf.text(pageText, 1920 - pageTextWidth - 50, 1150);
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

  setIsSending(true); // Start sending

  try {
    const pdf = await generatePdf();
    const pdfBlob = pdf.output('blob');
    const reader = new FileReader();

    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      sendGmail(base64data); // Proceed to send the email
    };

    reader.readAsDataURL(pdfBlob);
  } catch (error) {
    toast.error("Failed to prepare email.");
    setIsSending(false); // Re-enable button if error
  }
};


  const sendGmail = async (base64data) => {
  const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
  if (!accessToken) {
    toast.warn('Not authorized. Please sign in again.');
    setIsSending(false); // Re-enable button
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
    `Here is the captured image and details from reporter: ${reporterName}.`,
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

    setTimeout(() => {
      window.location.reload(); // Refresh after short delay
    }, 1000);
  } catch (error) {
    toast.error('Failed to send email');
    setIsSending(false); // Re-enable button on error
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
            <div><strong>House Number:</strong> {location.houseNumber}</div>
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
            <option value="Sauber">Sauber</option>
            <option value="Nicht sauber">Not sauber</option>
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

        <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
  <button
    onClick={sendEmail}
    disabled={isSending}
    style={{
      backgroundColor: isSending ? '#ccc' : '#007bff',
      color: '#fff',
      padding: '10px 20px',
      border: 'none',
      borderRadius: '6px',
      cursor: isSending ? 'not-allowed' : 'pointer',
      fontWeight: 'bold',
      fontSize: '16px',
      transition: 'background-color 0.3s ease',
    }}
  >
    {isSending ? 'Sending..Please Wait' : 'Send Email'}
  </button>

  {/* <button
    onClick={previewPdf}
    style={{
      backgroundColor: '#28a745',
      color: '#fff',
      padding: '10px 20px',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '16px',
      transition: 'background-color 0.3s ease',
    }}
  >
    Preview PDF
  </button> */}
</div>

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
            <iframe src={pdfPreview} title="PDF Preview" style={{ width: '500px', height: '70vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
