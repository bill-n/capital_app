import React, { useState, useRef, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import { gapi } from 'gapi-script';
import './App.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { saveAs } from "file-saver";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES = process.env.REACT_APP_GOOGLE_SCOPE;


function App() {
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [selectedFloor] = useState('1');
  const [selectedType] = useState('Classroom');
  const [selectedDescription] = useState('Sauber');
  const [reporterName, setReporterName] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [focusedTileIndex, setFocusedTileIndex] = useState(null);

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
  const authInstanceRef = useRef(null);

  const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    function start() {
      gapi.client
        .init({ clientId: CLIENT_ID, scope: SCOPES })
        .then(() => {
          const authInstance = gapi.auth2.getAuthInstance();
          authInstanceRef.current = authInstance;
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

const captureImage = () => {

  const imageSrc = webcamRef.current?.getScreenshot();
  if (imageSrc) {
    const imageData = {
      imageSrc,
      type: selectedType,
      description: selectedDescription,
      reporter: reporterName,
      facility: facilityName,
      floor: selectedFloor,
    };
    setCapturedImages((prev) => [...prev, imageData]);
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
  const totalPages = capturedImages.length + 1;
  const capital_image_template = await getBase64ImageFromURL('cleaning.jpeg');
  const capital_image_logo = await getBase64ImageFromURL('cleaning.jpeg');

  // Cover Page

  // ✅ Top-left Facility Name clearly above logo
const facilityText = facilityName || capturedImages[0]?.facility;
// const facilityTextWidth = pdf.getTextWidth(facilityText);
// const facilityCenterX = (1920 - facilityTextWidth) / 2;
pdf.setFont("helvetica", "normal");
pdf.setFontSize(78);
pdf.text(facilityText, 80, 80, { maxWidth: 1760 }); // Left margin: 80px
pdf.setFont("helvetica", "normal");
pdf.setFontSize(78);
pdf.setTextColor(0, 0, 0);
pdf.text(facilityText, 80, 80, {
  maxWidth: 1760,
  align: 'left',
  lineHeightFactor: 1.2,
});
// pdf.text(facilityText, facilityCenterX, 80);

const reporterText = reporterName || capturedImages[0]?.reporter;
const reporterTextWidth = pdf.getTextWidth(reporterText);
const reporterCenterX = (1920 - reporterTextWidth) / 2;
pdf.setFont("helvetica", "normal");
pdf.setFontSize(78);
pdf.text(reporterText, reporterCenterX, 1120);


  // ✅ Centered Logo
  const logoWidth = 1200;
  const logoHeight = 800;
  const logoX = (1920 - logoWidth) / 2;
  const logoY = 200; // Start below the title
  pdf.addImage(capital_image_template, 'JPEG', logoX, logoY, logoWidth, logoHeight, '', 'FAST');

const centerX = (1920 - reporterTextWidth) / 2;

// Draw reporter name centered near the bottom
pdf.text(reporterText, centerX, 1120); // Y = 1120 is just above the footer


  // ✅ Page number, bottom-right
  const firstPageNumber = `Page 1 of ${capturedImages.length + 1}`;
  const firstPageNumberWidth = pdf.getTextWidth(firstPageNumber);
  pdf.setFontSize(24);
  pdf.setTextColor(100, 100, 100);
  pdf.text(firstPageNumber, 1920 - firstPageNumberWidth - 50, 1150);

  // For each captured image
  for (let i = 0; i < capturedImages.length; i++) {
    const item = capturedImages[i];
    pdf.addPage();

    // Header
    const headerLogoWidth = 60;
    const headerLogoHeight = 60;
    const headerLogoX = 50;
    const headerLogoY = 40;
    pdf.addImage(capital_image_logo, 'PNG', headerLogoX, headerLogoY, headerLogoWidth, headerLogoHeight);
    pdf.setFontSize(36);
    pdf.text(item.facility, headerLogoX + headerLogoWidth + 20, headerLogoY + headerLogoHeight / 2 + 10);

    // Underline
    const underlineY = headerLogoY + headerLogoHeight + 10;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1);
    pdf.line(40, underlineY, 1880, underlineY);

    const verticalOffset = underlineY + 20;

    // Image
    const brightImage = await adjustImageBrightness(item.imageSrc, 1.6);
    const imageWidth = 900;
    const imageHeight = 900;
    const imageMarginLeft = 320;
    pdf.addImage(brightImage, 'JPEG', imageMarginLeft, verticalOffset, imageWidth, imageHeight);

    // Description next to the image
    const descriptionText = item.description || "No description provided";
    pdf.setFontSize(30);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(50, 50, 50);

    // Choose position: to the right of the image or below it
    const descX = imageMarginLeft + imageWidth + 30;  // right side of image
    const descY = verticalOffset + 350;  // top alignment with image

    // OR position it below the image like this:
    // const descX = imageMarginLeft;
    // const descY = verticalOffset + imageHeight + 40;

    pdf.text(`${descriptionText}`, descX, descY);

    // Metadata box OVER the image (top-right inside the image area)
    // Metadata box OVER the image (top-right inside the image area)
  const metadataLines = [
  `${location.latitude}`,
  `${location.longitude}`,
  `${location.timestamp}`,
  `Floor: ${item.floor}`,
  `${item.type}`, // ✅ use per-image values
  `${location.street} ${location.zipcode} ${location.houseNumber}`,
  `${location.city} ${location.country}`
];

pdf.setFontSize(20);
const metaBoxWidth = 300;
const metaBoxHeight = metadataLines.length * 25 + 20;
const metaBoxX = imageMarginLeft + imageWidth - metaBoxWidth - 20; // inside image, right padding
const metaBoxY = verticalOffset + 20; // top padding

// Draw semi-transparent black rounded box
pdf.setFillColor(0, 0, 0); // black with opacity
pdf.setDrawColor(150, 150, 150); // optional border (gray)
const cornerRadius = 15;
pdf.roundedRect(metaBoxX, metaBoxY, metaBoxWidth, metaBoxHeight, cornerRadius, cornerRadius, 'F');

// Add white text over the black box
let textY = metaBoxY + 25;
pdf.setTextColor(255, 255, 255);
metadataLines.forEach(line => {
pdf.text(line, metaBoxX + 15, textY);
textY += 25;
});


    // Footer
    pdf.setDrawColor(0, 0, 0);
    pdf.line(40, 1100, 1900, 1100);
    pdf.setFontSize(24);
    pdf.setTextColor(0, 0, 0);
    const locationFooter = `${location.street || ''} ${location.houseNumber || ''} ${location.zipcode || ''} ${location.city || ''}`.trim();
    pdf.text(locationFooter, 50, 1150);

    // Page number
    const pageNum = i + 2;
    const pageText = `Page ${pageNum} of ${totalPages}`;
    const pageTextWidth = pdf.getTextWidth(pageText);
    pdf.setFontSize(24);
    pdf.setTextColor(100, 100, 100);
    pdf.text(pageText, 1920 - pageTextWidth - 50, 1150);
  }

  return pdf;
};

  const previewPdf = async () => {
  setIsPreviewing(true);
  try {
    const pdf = await generatePdf();
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setPdfPreview(url);
    setIsModalOpen(true);
  } catch (err) {
    toast.error("Failed to generate preview.");
    console.error(err);
  } finally {
    setIsPreviewing(false);
  }
};

const updateCapturedImage = (index, field, value) => {
  setCapturedImages((prevImages) =>
    prevImages.map((img, idx) =>
      idx === index ? { ...img, [field]: value } : img
    )
  );
};

const uploadToICloud = async () => {
  if (capturedImages.length === 0) {
    toast.warn('No images captured.');
    return;
  }

  if (isMobileDevice()) {
    toast.info('After the download prompt, tap "Save to Files" and select iCloud Drive.');
  }

  setIsSending(true);
  try {
    const pdf = await generatePdf();
    const pdfBlob = pdf.output('blob');

    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Report_${facilityName}_${now}.pdf`;

    saveAs(pdfBlob, fileName); // Prompts download/share

    toast.success('PDF generated. Save it to iCloud Drive from your device.');

    // ✅ Reset the session
    resetPage();

  } catch (error) {
    console.error(error);
    toast.error('Failed to generate or save PDF.');
  } finally {
    setIsSending(false);
  }
};

  const resetPage = () => {
    setCapturedImages([]);
    setReporterName('');
    setFacilityName('');
    setPdfPreview(null);
    setIsModalOpen(false);
    setFocusedTileIndex(null);
  };

  return (
    <div className="App">
      <h1 className="app-title">
        <span role="img" aria-label="building">🏢</span>{' '}
        <span style={{ color: 'black' }}>CLEANING </span>{' '}
        <span style={{ color: '#c4aa6a' }}>COMPANY</span>
      </h1>
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
            top: '5px',
            right: '5px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '5px',
            borderRadius: '8px',
            fontSize: '10px',
            maxWidth: '400px',
            textAlign: 'left',
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
              <button
              onClick={captureImage}
              className="capture-btn"
              style={{
                position: 'absolute',
                bottom: '5px',
                left: '50%',
                transform: 'translateX(-50%)'
              }}
            >
              Capture Image
            </button>
        </div>
      </div>

      <ToastContainer position="bottom-right" autoClose={3000} />
      <div
        className="global-inputs"
        style={{
          margin: '15px auto',
          padding: '15px',
          maxWidth: '400px',
          backgroundColor: '#f9f9f9',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '15px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 250px' }}>
          <label style={{ marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            Facility Name:
          </label>
          <input
            type="text"
            value={facilityName}
            onChange={(e) => setFacilityName(e.target.value)}
            placeholder="Enter facility"
            style={{
              padding: '10px 12px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              fontSize: '16px',
            }}
          />
        </div>

    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 250px' }}>
      <label style={{ marginBottom: '8px', fontWeight: '600', color: '#333' }}>
        Reporter Name:
      </label>
      <input
        type="text"
        value={reporterName}
        onChange={(e) => setReporterName(e.target.value)}
        placeholder="Enter reporter"
        style={{
          padding: '10px 12px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          fontSize: '16px',
        }}
      />
      </div>
    </div>

      {capturedImages.length > 0 && (
        <div className="captured-image-container" style={{ width: '100%' }}>
        <div
          className="captured-image"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'center',
            textAlign:'left'
          }}
        >
    {capturedImages.map((item, idx) => (
      <div
        key={idx}
        className={`image-tile ${focusedTileIndex === idx ? 'tile-glow' : ''}`}
      >
        <img src={item.imageSrc} alt={`Captured ${idx}`} className="tile-image" />

        <button
          onClick={() => removeImage(idx)}
          className="tile-remove-button"
          title="Remove image"
        >
          ✕
        </button>

        <div className="tile-fields">
          <label>
            <strong>Type:</strong>
            <select
              value={item.type}
              onChange={(e) => updateCapturedImage(idx, 'type', e.target.value)}
              onFocus={() => setFocusedTileIndex(idx)}
              onBlur={() => setFocusedTileIndex(null)}
            >
              <option value="Classroom">Classroom</option>
              <option value="Floor">Floor</option>
              <option value="Restroom">Restroom</option>
              <option value="Stairs">Stairs</option>
            </select>
          </label>

          <label>
            <strong>Description:</strong>
            <select
              value={item.description}
              onChange={(e) => updateCapturedImage(idx, 'description', e.target.value)}
              onFocus={() => setFocusedTileIndex(idx)}
              onBlur={() => setFocusedTileIndex(null)}
            >
              <option value="Sauber">Sauber</option>
              <option value="Nicht sauber">Nicht sauber</option>
            </select>
          </label>

          <label>
            <strong>Floor:</strong>
            <select
              value={item.floor}
              onChange={(e) => updateCapturedImage(idx, 'floor', e.target.value)}
              onFocus={() => setFocusedTileIndex(idx)}
              onBlur={() => setFocusedTileIndex(null)}
            >
              {[...Array(50)].map((_, i) => (
                <option key={i} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    ))}

  </div>

  {/* Buttons section */}
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      marginTop: '20px',
      justifyContent: 'center',
    }}
  >
    <button
        onClick={previewPdf}
        disabled={isPreviewing}
        style={{
          backgroundColor: isPreviewing ? '#ccc' : '#28a745',
          color: '#fff',
          padding: '10px 20px',
          border: 'none',
          borderRadius: '6px',
          cursor: isPreviewing ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          fontSize: '16px',
          flex: '1 1 150px',
        }}
      >
        {isPreviewing ? 'Generating Preview...' : 'Preview PDF'}
      </button>


    <button
        onClick={uploadToICloud}
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
          flex: '1 1 150px',
        }}
      >
      {isSending ? 'Saving...' : 'Save to iCloud'}
    </button>

  </div>
</div>

      )}

      {isModalOpen && (
      <div
  className="modal-backdrop"
  onClick={() => setIsModalOpen(false)}
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px', // Add spacing for smaller screens
    boxSizing: 'border-box',
  }}
>
  <div
    className="modal-content"
    onClick={(e) => e.stopPropagation()}
    style={{
      position: 'relative',
      backgroundColor: '#fff',
      borderRadius: '12px',
      padding: '20px',
      width: '100%',
      maxWidth: '800px',
      height: '100%',
      maxHeight: '90vh',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    }}
  >


      {/* Close Button */}
      <button
        onClick={() => setIsModalOpen(false)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'red',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
        aria-label="Close PDF Preview"
      >
        X
      </button>
              {/* PDF Viewer */}
              <div style={{
                    margin: 'auto',
                    flex:1,
                    marginTop: '40px',
                    overflow:'auto',
                    width: '100%',
                    // height: '80vh',
                    maxWidth: '800px',
                  }}>
                <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`}>
                  <Viewer fileUrl={pdfPreview} />
                </Worker>
              </div>
            </div>
          </div>
        )}
  </div>
  );
}

export default App;
