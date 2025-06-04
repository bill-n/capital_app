import React, { useState, useRef, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import { gapi } from 'gapi-script';
import './App.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES = process.env.REACT_APP_GOOGLE_SCOPE;


function App() {
  const [isSending, setIsSending] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState('1');
  const [selectedType, setSelectedType] = useState('Classroom');
  const [selectedDescription, setSelectedDescription] = useState('Sauber');
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
  const authInstanceRef = useRef(null);

  const downloadImagesAsZip = async () => {
  if (capturedImages.length === 0) {
    toast.warn('No images to download.');
    return;
  }

  const zip = new JSZip();

  for (let i = 0; i < capturedImages.length; i++) {
    try {
      const imageDataUrl = capturedImages[i];
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      zip.file(`image_${i + 1}.jpeg`, blob);
    } catch (error) {
      console.error(`Error fetching image ${i + 1}`, error);
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const now = new Date();

// Format datetime: YYYY-MM-DD_HH-MM
const datetime = now
  .toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  .replace(' ', '_')
  .replace(/:/g, '-');

// reporter and facility names
const clean = (str) =>
  (str || '').trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '');

const reporter = clean(reporterName);
const facility = clean(facilityName);

// Compose final filename
const filename = `${reporter}_${facility}_${datetime}.zip`;
saveAs(zipBlob, filename);
};


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

  const capital_image_template = await getBase64ImageFromURL('capital_image_template.png');
  const capital_image_logo = await getBase64ImageFromURL('capital_image_logo.png');

  // Cover Page
  pdf.setFontSize(60);
  pdf.text(facilityName, 50, 100);
  const logoWidth = 1200;
  const logoHeight = 900;
  const logoX = (1920 - logoWidth) / 2;
  const logoY = 150;
  pdf.addImage(capital_image_template, 'PNG', logoX, logoY, logoWidth, logoHeight);
  pdf.setFontSize(36);
  pdf.text(`${reporterName}`, 150, 1150);
  const firstPageNumber = `Page 1 of ${totalPages}`;
  const firstPageNumberWidth = pdf.getTextWidth(firstPageNumber);
  pdf.setFontSize(24);
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
  `${selectedFloor} ${selectedType}`,
  `${location.street}`, 
  `${location.zipcode} ${location.houseNumber}`,
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
    pdf.line(30, 1100, 1000, 1100);
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

  setIsSending(true);

  try {
    const pdf = await generatePdf();
    const pdfBlob = pdf.output('blob');

    const formData = new FormData();
    formData.append('reporterName', reporterName);
    formData.append('facilityName', facilityName);
    formData.append('pdf', pdfBlob, 'report.pdf');

    const response = await fetch('http://localhost:3000/send-email', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Failed to send email');

    toast.success('Email sent successfully!');
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error(error);
    toast.error('Failed to send email.');
    setIsSending(false);
  }
};

  return (
    <div className="App">
      <h1 className="app-title">
        <span role="img" aria-label="building">🏢</span>{' '}
        <span style={{ color: 'black' }}>CAPITAL </span>{' '}
        <span style={{ color: '#c4aa6a' }}>INFRADIENST</span>
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
            <option value="Nicht sauber">Nicht sauber</option>
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
        style={{
          position: 'relative',
          width: '150px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#fff',
          padding: '5px',
          flex: '1 1 150px', // allow flexible shrink/grow
          maxWidth: '200px',
        }}
      >
        <img
          src={item.imageSrc}
          alt={`Captured ${idx}`}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '4px',
            display: 'block',
          }}
        />

        {/* ✕ Remove button */}
        <button
          onClick={() => removeImage(idx)}
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            background: 'red',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: '24px',
            textAlign: 'center',
          }}
          title="Remove image"
        >
          ✕
        </button>

        <div style={{ fontSize: '12px', marginTop: '6px', wordWrap: 'break-word' }}>
          <p><strong>Type:</strong> {item.type}</p>
          <p><strong>Description:</strong> {item.description}</p>
          <p><strong>Reporter:</strong> {item.reporter}</p>
          <p><strong>Facility:</strong> {item.facility}</p>
          <p><strong>Floor:</strong> {item.floor}</p>
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
      onClick={downloadImagesAsZip}
      style={{
        backgroundColor: '#6c63ff',
        color: '#fff',
        padding: '10px 20px',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '16px',
        flex: '1 1 150px',
      }}
    >
      Save Image(s)
    </button>

    <button
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
        flex: '1 1 150px',
      }}
    >
      Preview PDF
    </button>

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
        flex: '1 1 150px', // flexible on small screens
      }}
    >
      {isSending ? 'Sending..Please Wait' : 'Send Email'}
    </button>
  </div>
</div>

      )}

      {isModalOpen && (
  <div
    className="modal-backdrop"
    onClick={() => setIsModalOpen(false)} // close on outside click
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}
  >
    <div
      className="modal-content"
      onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
      style={{
        position: 'relative',
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '70%',
        maxHeight: '70%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
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
              <div style={{ height: '60vh', width: '50vh', marginTop: '40px' }}>
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
