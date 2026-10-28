
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCurrentUser,
  fetchUserAttributes,
  fetchAuthSession,
  signOut,
} from "aws-amplify/auth";

import {
  CalendarDays,
  Bell,
  UploadCloud,
  Plus,
  Pencil,
  Fingerprint,
  Landmark,
  BookMarked,
  HeartPulse,
  Home,
  Users,
  LayoutGrid,
  Settings,
  X,
  Trash2,
  UserRound,
  LogOut,
  ChevronRight,
  FileText,
  Camera,
  Download,
  RefreshCw,
} from "lucide-react";

import "./Dashboard.css";

const API_URL =
  "https://df9aajz1zf.execute-api.ap-southeast-2.amazonaws.com";

const INACTIVITY_LIMIT = 10 * 60 * 1000;


const RELATIONSHIPS = [
  "Mother",
  "Father",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Wife",
  "Husband",
  "Grandmother",
  "Grandfather",
  "Grandson",
  "Granddaughter",
  "Other",
];

const CATEGORIES = [
  { name: "Identity", icon: Fingerprint, color: "#c96d20" },
  { name: "Finance", icon: Landmark, color: "#1788c6" },
  { name: "Diary", icon: BookMarked, color: "#b526ba" },
  { name: "Health", icon: HeartPulse, color: "#d84b72" },
];

// =====================================================
// AUTHENTICATION
// =====================================================

async function getAuthToken() {
  const session = await fetchAuthSession();

  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error(
      "Your login session is unavailable. Please log in again."
    );
  }

  return token;
}

// =====================================================
// AUTHENTICATED API GATEWAY REQUEST
// =====================================================

async function apiRequest(method, path, body) {
  const token = await getAuthToken();

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
        `API request failed with status ${response.status}`
    );
  }

  return result;
}

// =====================================================
// PROFILE PHOTO PROCESSING
// =====================================================

function processProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
      reject(new Error("Unable to read the selected photo."));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () =>
        reject(new Error("Unable to open the selected image."));

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 400;

        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height)
        );

        canvas.width = Math.max(
          1,
          Math.round(image.width * scale)
        );

        canvas.height = Math.max(
          1,
          Math.round(image.height * scale)
        );

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Image processing is unavailable."));
          return;
        }

        context.fillStyle = "#ffffff";

        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        context.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

// =====================================================
// CONVERT PHOTO DATA URL TO BLOB
// =====================================================

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");

  if (
    !header?.startsWith("data:image/jpeg;base64") ||
    !encoded
  ) {
    throw new Error("Invalid profile photo data.");
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], {
    type: "image/jpeg",
  });
}

// =====================================================
// UPLOAD PROFILE PHOTO TO S3
// =====================================================

async function uploadPhotoToS3(memberId, photoDataUrl) {
  const { uploadUrl } = await apiRequest(
    "POST",
    "/photos/upload-url",
    {
      memberId,
      contentType: "image/jpeg",
    }
  );

  if (!uploadUrl) {
    throw new Error("AWS did not return a photo upload URL.");
  }

  const blob = dataUrlToBlob(photoDataUrl);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg",
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(
      `S3 photo upload failed (${response.status}).`
    );
  }
}

// =====================================================
// GET PROFILE PHOTO VIEWING URL
// =====================================================

async function getPhotoUrl(memberId) {
  try {
    const result = await apiRequest(
      "GET",
      `/photos/view-url?memberId=${encodeURIComponent(
        memberId
      )}`
    );

    return result.viewUrl || "";
  } catch (error) {
    if (
      error.message === "Photo not found" ||
      error.message.includes("404")
    ) {
      return "";
    }

    throw error;
  }
}

// =====================================================
// DELETE PROFILE PHOTO
// =====================================================

async function deletePhotoFromS3(memberId) {
  await apiRequest("DELETE", "/photos", {
    memberId,
  });
}

// =====================================================
// DOCUMENT MANAGEMENT
//
// EXISTING FUNCTIONALITY PRESERVED
//
// Family profile:
//   memberId = selected family member's ID
//
// Home upload:
//   memberId = "me"
//
// Both use the same secure AWS backend.
// =====================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

const DOCUMENT_TYPES = [
  // Identity & KYC
  "Aadhaar Card",
  "PAN Card",
  "Passport",
  "Voter ID Card (EPIC)",
  "Driving Licence",

  // Birth & Family
  "Birth Certificate",
  "Marriage Certificate",
  "Death Certificate",
  "Family Member Certificate",
  "Legal Heir Certificate",

  // Education
  "10th Class Marksheet",
  "12th Class Marksheet",
  "Degree Certificate",
  "Diploma Certificate",
  "Transfer Certificate",

  // Banking & Finance
  "Bank Passbook",
  "Bank Statement",
  "Fixed Deposit Receipt",
  "Loan Agreement",

  // Property
  "Property Sale Deed",
  "Property Tax Receipt",
  "Encumbrance Certificate",

  // Health
  "Medical Report",
  "Medical Prescription",
  "Health Insurance Policy",

  // Other
  "Other Document",
];

// =====================================================
// DOCUMENT API
// =====================================================

async function documentsApi(method, path, body) {
  const session = await fetchAuthSession();

  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error("Session expired. Please log in again.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `Request failed (${response.status})`
    );
  }

  return data;
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) {
    return "Unknown size";
  }

  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

// =====================================================
// DOCUMENTS COMPONENT
//
// REUSED BY BOTH UPLOAD METHODS
// =====================================================

function Documents({
  memberId,
  memberName = "My Documents",
  isHomeUpload = false,
  onClose,
}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");

  const [documentType, setDocumentType] =
    useState("Aadhaar Card");

  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);

  // =====================================================
  // LOAD DOCUMENTS
  // =====================================================

  const loadDocuments = useCallback(async () => {
    if (!memberId) return;

    setLoading(true);
    setError("");

    try {
      const result = await documentsApi(
        "GET",
        `/documents?memberId=${encodeURIComponent(memberId)}`
      );

      if (mountedRef.current) {
        setDocuments(
          Array.isArray(result.documents)
            ? result.documents
            : []
        );
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [memberId]);

  useEffect(() => {
    mountedRef.current = true;

    loadDocuments();

    return () => {
      mountedRef.current = false;
    };
  }, [loadDocuments]);

  // =====================================================
  // UPLOAD DOCUMENT
  // =====================================================

  async function handleUpload(event) {
    event.preventDefault();

    if (!file || busy) return;

    setError("");
    setNotice("");

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      setError(
        "Unsupported file type. Select PDF, JPG, PNG, Word, Excel, or PowerPoint."
      );
      return;
    }

    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      setError(
        "The file must be larger than 0 bytes and no more than 10 MB."
      );
      return;
    }

    setUploadFileName(file.name);
    setUploadPhase(1);
    setBusy(true);

    let uploadStage =
      "Stage 1: Requesting S3 upload URL";

    try {
      // IMPORTANT:
      // The memberId comes from the selected upload route.
      //
      // Home -> "me"
      // Family profile -> selected family member ID

      const result = await documentsApi(
        "POST",
        "/documents/upload-url",
        {
          memberId,
          documentType,
          fileName: file.name,
          fileSize: file.size,
        }
      );

      if (
        !result.uploadUrl ||
        !result.fields ||
        !result.documentId
      ) {
        throw new Error(
          "AWS returned an incomplete upload response."
        );
      }

      uploadStage = "Stage 2: Uploading file to S3";
      setUploadPhase(2);

      const formData = new FormData();

      Object.entries(result.fields).forEach(
        ([key, value]) => {
          formData.append(key, value);
        }
      );

      formData.append("file", file);

      const s3Hostname = new URL(
        result.uploadUrl
      ).hostname;

      let uploadResponse;

      try {
        uploadResponse = await fetch(result.uploadUrl, {
          method: "POST",
          body: formData,
        });
      } catch (networkError) {
        throw new Error(
          `S3 endpoint: ${s3Hostname} | ` +
            `File type: ${file.type || "unknown"} | ` +
            `Network error: ${networkError.message}`
        );
      }

      if (!uploadResponse.ok) {
        throw new Error(
          `S3 upload failed with HTTP ${uploadResponse.status}`
        );
      }

      uploadStage =
        "Stage 3: Confirming document upload";
      setUploadPhase(3);

      await documentsApi(
        "POST",
        "/documents/confirm",
        {
          documentId: result.documentId,
        }
      );

      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setNotice("Document uploaded successfully.");

      await loadDocuments();
    } catch (err) {
      setError(`${uploadStage} — ${err.message}`);
    } finally {
      setBusy(false);
      setUploadPhase(0);
      setUploadFileName("");
    }
  }

  // =====================================================
  // VIEW SAVED AI DOCUMENT DETAILS
  //
  // Reads the result already stored in DynamoDB.
  // This does NOT call Bedrock and does NOT consume new AI tokens.
  // =====================================================

  async function handleViewDetails(document) {
    if (detailsLoadingId || busy) return;

    setDetailsLoadingId(document.documentId);
    setScanResult(null);
    setScanError("");

    try {
      const result = await documentsApi(
        "GET",
        `/documents/details?documentId=${encodeURIComponent(
          document.documentId
        )}`
      );

      const savedResult = result.scanResult || {};

      setScanResult({
        fileName: result.fileName || document.fileName || "Document",
        extractedData: savedResult,
        model: result.scanModel || "—",
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        totalTokens: result.totalTokens ?? 0,
        executionTimeSeconds:
          result.scanTimeSeconds ?? result.executionTimeSeconds ?? "—",
        scannedAt: result.scannedAt || "",
      });
    } catch (err) {
      setScanError(
        err.message || "Unable to load saved document details."
      );
    } finally {
      setDetailsLoadingId(null);
    }
  }

  // =====================================================
  // DOWNLOAD DOCUMENT
  // =====================================================

  async function handleDownload(document) {
    setError("");

    try {
      const result = await documentsApi(
        "GET",
        `/documents/view-url?documentId=${encodeURIComponent(
          document.documentId
        )}`
      );

      if (!result.url) {
        throw new Error(
          "AWS did not return a download URL."
        );
      }

      window.location.assign(result.url);
    } catch (err) {
      setError(err.message);
    }
  }

  // =====================================================
  // RENAME DOCUMENT
  // =====================================================

  async function handleRename(document) {
    const newName = window.prompt(
      "Document name:",
      document.fileName
    );

    if (newName === null) return;

    const cleaned = newName.trim();

    if (!cleaned || cleaned.length > 200) {
      setError(
        "Document name must contain 1–200 characters."
      );
      return;
    }

    if (cleaned === document.fileName) return;

    setBusy(true);
    setError("");

    try {
      await documentsApi("PATCH", "/documents", {
        documentId: document.documentId,
        fileName: cleaned,
      });

      await loadDocuments();

      setNotice("Document renamed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // =====================================================
  // DELETE DOCUMENT
  // =====================================================

  async function handleDelete(document) {
    if (
      !window.confirm(
        `Permanently delete “${document.fileName}”?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await documentsApi("DELETE", "/documents", {
        documentId: document.documentId,
      });

      await loadDocuments();

      setNotice("Document deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // =====================================================
  // GROUP DOCUMENTS BY CATEGORY
  // =====================================================

  const grouped = documents.reduce(
    (groups, document) => {
      const key =
        document.documentType || "Other";

      (groups[key] ||= []).push(document);

      return groups;
    },
    {}
  );

  // =====================================================
  // DOCUMENT MANAGER UI
  // =====================================================

  return (
    <section
      className="documents-panel"
      aria-label={isHomeUpload ? "Upload Documents" : `${memberName} documents`}
    >
      <style>{`
        @keyframes familyUploadSlide { 0% { transform:translateX(-110%); } 100% { transform:translateX(360%); } }
        @keyframes familyUploadSpin { to { transform:rotate(360deg); } }
        @keyframes familyUploadFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
        @keyframes familyUploadDot { 0%,65%,100% { opacity:.25; transform:scale(.8); } 35% { opacity:1; transform:scale(1); } }
        @keyframes familyUploadAppear { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .document-upload-progress { margin:16px 0; padding:20px; border:1px solid #e4dcfa; border-radius:18px; background:linear-gradient(140deg,#faf8ff,#f4f8ff); box-shadow:0 8px 24px rgba(91,62,155,.08); animation:familyUploadAppear .35s ease both; }
        .document-upload-progress-top { display:flex; align-items:center; gap:12px; min-width:0; }
        .document-upload-progress-icon { display:grid; place-items:center; flex:0 0 48px; height:48px; border-radius:15px; background:#e9e1fb; color:#7147b5; animation:familyUploadFloat 2s ease-in-out infinite; }
        .document-upload-progress-copy { display:flex; flex-direction:column; min-width:0; flex:1; gap:4px; }
        .document-upload-progress-copy strong { color:#352357; font-size:15px; }
        .document-upload-progress-copy span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:13px; color:#766c89; }
        .document-upload-progress-dots { display:flex; gap:4px; }
        .document-upload-progress-dots i { width:6px; height:6px; border-radius:50%; background:#7147b5; animation:familyUploadDot 1.2s ease-in-out infinite; }
        .document-upload-progress-dots i:nth-child(2) { animation-delay:.2s; }
        .document-upload-progress-dots i:nth-child(3) { animation-delay:.4s; }
        .document-upload-progress-track { position:relative; height:8px; overflow:hidden; border-radius:99px; background:#e5ddf5; margin-top:18px; }
        .document-upload-progress-bar { position:absolute; width:30%; height:100%; border-radius:99px; background:linear-gradient(90deg,#7147b5,#a78bfa); animation:familyUploadSlide 1.65s ease-in-out infinite; }
        .document-upload-progress-steps { display:flex; justify-content:space-between; gap:8px; margin-top:12px; color:#9a91a9; font-size:11px; font-weight:600; }
        .document-upload-progress-steps .current { color:#7147b5; }
        .document-upload-progress > p { margin:13px 0 0; font-size:12px; color:#766c89; }
        .document-upload-spinner { width:18px; height:18px; display:inline-block; flex-shrink:0; border:2px solid rgba(255,255,255,.4); border-top-color:currentColor; border-radius:50%; animation:familyUploadSpin .75s linear infinite; }
        @media (prefers-reduced-motion:reduce) { .document-upload-progress *, .document-upload-spinner { animation:none !important; } .document-upload-progress-bar { width:100%; transform:none; } }
      `}</style>
      <div className="documents-header">
        <div>
          <h2>{isHomeUpload ? "Upload Documents" : `${memberName}'s Documents`}</h2>
          <p>
            Securely stored in your private family vault
          </p>
        </div>

        <div className="documents-header-actions">
          <button
            type="button"
            onClick={loadDocuments}
            disabled={loading || busy}
            aria-label="Refresh documents"
          >
            <RefreshCw size={19} />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close documents"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <form
        className="documents-upload"
        onSubmit={handleUpload}
      >
        <label htmlFor="documents-file">
          Choose a document (up to 10 MB)
        </label>

        <input
          id="documents-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={(event) =>
            setFile(event.target.files?.[0] || null)
          }
          disabled={busy}
        />

        <label htmlFor="documents-type">
          Document category
        </label>

        <select
          id="documents-type"
          value={documentType}
          onChange={(event) =>
            setDocumentType(event.target.value)
          }
          disabled={busy}
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!file || busy}
        >
          {busy ? (
            <span className="document-upload-spinner" aria-hidden="true" />
          ) : (
            <Plus size={18} />
          )}
          {busy ? "Uploading securely…" : "Upload Document"}
        </button>
      </form>

      {busy && uploadPhase > 0 && (
        <div className="document-upload-progress" role="status" aria-live="polite" aria-atomic="true">
          <div className="document-upload-progress-top">
            <span className="document-upload-progress-icon" aria-hidden="true">
              <UploadCloud size={24} />
            </span>
            <div className="document-upload-progress-copy">
              <strong>
                {uploadPhase === 1
                  ? "Preparing secure upload"
                  : uploadPhase === 2
                    ? "Uploading your document"
                    : "Finishing up securely"}
              </strong>
              <span title={uploadFileName}>{uploadFileName}</span>
            </div>
            <span className="document-upload-progress-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
          <div className="document-upload-progress-track" aria-label="Upload in progress">
            <div className="document-upload-progress-bar" />
          </div>
          <div className="document-upload-progress-steps">
            <span className={uploadPhase >= 1 ? "current" : ""}>1. Preparing</span>
            <span className={uploadPhase >= 2 ? "current" : ""}>2. Uploading</span>
            <span className={uploadPhase >= 3 ? "current" : ""}>3. Saving</span>
          </div>
          <p>Please keep this window open. Your file is being processed securely.</p>
        </div>
      )}

      {error && (
        <p
          className="documents-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          className="documents-notice"
          role="status"
        >
          {notice}
        </p>
      )}

      {scanError && (
        <p className="documents-error" role="alert">{scanError}</p>
      )}

      {scanResult && (
        <section className="family-scanner-result" aria-label="AI scan results"
          style={{ margin: "18px 0", padding: 18, border: "1px solid #ded5f1", borderRadius: 16, background: "#faf8ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>AI Document Scan</h3>
            <button type="button" onClick={() => setScanResult(null)} aria-label="Close scan result"><X size={18} /></button>
          </div>
          <p><strong>File:</strong> {scanResult.fileName || "Document"}</p>
          <p><strong>Detected type:</strong> {scanResult.extractedData?.documentType || "Unknown"}</p>
          <h4>Extracted fields</h4>
          {Object.keys(scanResult.extractedData?.fields || {}).length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <tbody>
                  {Object.entries(scanResult.extractedData.fields).map(([key, value]) => (
                    <tr key={key}>
                      <th style={{ padding: 8, borderBottom: "1px solid #e8e0f4" }}>{key}</th>
                      <td style={{ padding: 8, borderBottom: "1px solid #e8e0f4", whiteSpace: "pre-wrap" }}>
                        {value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No structured fields returned.</p>}
          {!!scanResult.extractedData?.tables?.length && (
            <>
              <h4>Tables</h4>
              <pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(scanResult.extractedData.tables, null, 2)}</pre>
            </>
          )}
          {!!scanResult.extractedData?.warnings?.length && (
            <p><strong>Warnings:</strong> {scanResult.extractedData.warnings.join("; ")}</p>
          )}
          <h4>Model usage</h4>
          <table style={{ width: "100%", textAlign: "left" }}>
            <tbody>
              <tr><th>Model</th><td>{scanResult.model}</td></tr>
              <tr><th>Input tokens</th><td>{scanResult.inputTokens ?? 0}</td></tr>
              <tr><th>Output tokens</th><td>{scanResult.outputTokens ?? 0}</td></tr>
              <tr><th>Total tokens</th><td>{scanResult.totalTokens ?? 0}</td></tr>
              <tr><th>Execution time</th><td>{scanResult.executionTimeSeconds ?? "—"} seconds</td></tr>
              {scanResult.scannedAt && (
                <tr><th>Scanned at</th><td>{scanResult.scannedAt}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {loading ? (
        <p className="documents-empty">
          Loading documents...
        </p>
      ) : documents.length === 0 ? (
        <p className="documents-empty">
          No documents uploaded for this family member yet.
        </p>
      ) : (
        <div className="documents-groups">
          {Object.entries(grouped).map(
            ([type, items]) => (
              <div
                className="documents-group"
                key={type}
              >
                <h3>
                  {type} ({items.length})
                </h3>

                {items.map((document) => (
                  <div
                    className="documents-item"
                    key={document.documentId}
                  >
                    <FileText
                      size={23}
                      aria-hidden="true"
                    />

                    <div className="documents-item-info">
                      <strong>
                        {document.fileName}
                      </strong>

                      <span>
                        {formatSize(
                          document.fileSize
                        )}
                      </span>
                    </div>

                    <div className="documents-item-actions">
                      {document.scanStatus === "COMPLETED" ? (
                        <button
                          type="button"
                          onClick={() => handleViewDetails(document)}
                          disabled={busy || !!detailsLoadingId}
                          title="View saved AI details"
                          aria-label={`View details for ${document.fileName}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", color: "#7147b5" }}
                        >
                          <FileText size={17} />
                          {detailsLoadingId === document.documentId
                            ? "Loading…"
                            : "View Details"}
                        </button>
                      ) : document.scanStatus === "PROCESSING" ? (
                        <button
                          type="button"
                          disabled
                          title="AI analysis is in progress"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px" }}
                        >
                          <RefreshCw size={17} />
                          Analyzing…
                        </button>
                      ) : document.scanStatus === "FAILED" ? (
                        <button
                          type="button"
                          disabled
                          title={document.scanError || "Automatic AI scan failed"}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px" }}
                        >
                          <FileText size={17} />
                          Scan Failed
                        </button>
                      ) : document.scanStatus === "NOT_SUPPORTED" ? (
                        <button
                          type="button"
                          disabled
                          title="AI analysis is not available for this file type"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px" }}
                        >
                          <FileText size={17} />
                          Not Supported
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          handleDownload(document)
                        }
                        disabled={busy}
                        title="Download"
                        aria-label={`Download ${document.fileName}`}
                      >
                        <Download size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleRename(document)
                        }
                        disabled={busy}
                        title="Rename"
                        aria-label={`Rename ${document.fileName}`}
                      >
                        <Pencil size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(document)
                        }
                        disabled={busy}
                        title="Delete"
                        aria-label={`Delete ${document.fileName}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

// =====================================================
// MAIN DASHBOARD COMPONENT
// =====================================================

function Dashboard() {
  const navigate = useNavigate();

  const photoInputRef = useRef(null);
  const photoRequestRef = useRef(0);
  const photoVersionRef = useRef(0);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] =
    useState(false);

  const [
    initialMembersReady,
    setInitialMembersReady,
  ] = useState(false);

  const [
    initialPhotoReady,
    setInitialPhotoReady,
  ] = useState(false);

  const [membersError, setMembersError] = useState("");
  const [myPhoto, setMyPhoto] = useState("");

  const [showAddModal, setShowAddModal] =
    useState(false);

  // =====================================================
  // EXISTING DOCUMENT MANAGER STATE
  // =====================================================

  const [documentMember, setDocumentMember] =
    useState(null);

  // Existing functionality:
  // Open document manager for any family member.

  const openMemberDocuments = (memberId, name) => {
    setShowAddModal(false);

    setDocumentMember({
      memberId,
      name,
    });
  };

  // =====================================================
  // NEW FEATURE: HOME SCREEN DOCUMENT UPLOAD
  //
  // Always opens the authenticated user's documents.
  //
  // "me" is the primary account holder's profile.
  //
  // Existing family member uploads are not affected.
  // =====================================================

  const openHomeDocuments = () => {
    setShowAddModal(false);
    setDocumentMember({
      memberId: "me",
      name: user?.name || "My",
      isHomeUpload: true,
    });
  };

  // =====================================================
  // PROFILE EDITING STATE
  // =====================================================

  const [editingId, setEditingId] = useState(null);
  const [editingSelf, setEditingSelf] =
    useState(false);

  const [memberName, setMemberName] = useState("");
  const [relationship, setRelationship] =
    useState("");

  const [memberPhoto, setMemberPhoto] =
    useState("");

  const [photoChanged, setPhotoChanged] =
    useState(false);

  const [
    processingPhoto,
    setProcessingPhoto,
  ] = useState(false);

  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] =
    useState("Home");

  const [error, setError] = useState("");
  const [logoutError, setLogoutError] =
    useState("");

  const [photoRefresh, setPhotoRefresh] =
    useState(0);

  const [
    sessionTimedOut,
    setSessionTimedOut,
  ] = useState(false);

  const familyLoading = !initialMembersReady;

  const myPhotoKey = user
    ? `family-app-profile-photo-${user.id}`
    : null;

  const memberPhotosKey = user
    ? `family-app-member-photos-${user.id}`
    : null;

  const getMemberPhotos = () => {
    if (!memberPhotosKey) return {};

    try {
      return JSON.parse(
        localStorage.getItem(memberPhotosKey) || "{}"
      );
    } catch {
      return {};
    }
  };

  // =====================================================
  // LOAD COGNITO USER
  // =====================================================

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const currentUser =
          await getCurrentUser();

        const attributes =
          await fetchUserAttributes();

        if (!active) return;

        setUser({
          id: currentUser.userId,
          name:
            attributes.name?.trim() ||
            attributes.given_name?.trim() ||
            "",
          email: attributes.email || "",
        });
      } catch (err) {
        console.error(
          "Authentication error:",
          err
        );

        if (active) {
          navigate("/login", {
            replace: true,
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, [navigate]);

  // =====================================================
  // INACTIVITY SESSION TIMEOUT
  // =====================================================

  useEffect(() => {
    if (
      !user ||
      loggingOut ||
      sessionTimedOut
    ) {
      return;
    }

    let inactivityTimer = null;
    let expired = false;
    let lastActivity = Date.now();

    const expireSession = async () => {
      if (expired) return;

      expired = true;
      clearTimeout(inactivityTimer);

      activityEvents.forEach((eventName) => {
        window.removeEventListener(
          eventName,
          resetInactivityTimer
        );
      });

      document.removeEventListener(
        "visibilitychange",
        checkInactivity
      );

      window.removeEventListener(
        "focus",
        checkInactivity
      );

      setSessionTimedOut(true);

      try {
        await signOut();
      } catch (err) {
        console.error(
          "Automatic session logout error:",
          err
        );
      } finally {
        setUser(null);
        setMembers([]);
        setMyPhoto("");

        navigate("/login", {
          replace: true,
          state: {
            sessionTimeout: true,
          },
        });
      }
    };

    const checkInactivity = () => {
      if (expired) return;

      const elapsed =
        Date.now() - lastActivity;

      if (elapsed >= INACTIVITY_LIMIT) {
        expireSession();
      } else {
        clearTimeout(inactivityTimer);

        inactivityTimer = setTimeout(
          expireSession,
          INACTIVITY_LIMIT - elapsed
        );
      }
    };

    const resetInactivityTimer = () => {
      if (expired) return;

      if (document.hidden) return;

      if (
        Date.now() - lastActivity >=
        INACTIVITY_LIMIT
      ) {
        expireSession();
        return;
      }

      lastActivity = Date.now();

      clearTimeout(inactivityTimer);

      inactivityTimer = setTimeout(
        expireSession,
        INACTIVITY_LIMIT
      );
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "pointerdown",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(
        eventName,
        resetInactivityTimer,
        { passive: true }
      );
    });

    document.addEventListener(
      "visibilitychange",
      checkInactivity
    );

    window.addEventListener(
      "focus",
      checkInactivity
    );

    inactivityTimer = setTimeout(
      expireSession,
      INACTIVITY_LIMIT
    );

    return () => {
      clearTimeout(inactivityTimer);

      activityEvents.forEach((eventName) => {
        window.removeEventListener(
          eventName,
          resetInactivityTimer
        );
      });

      document.removeEventListener(
        "visibilitychange",
        checkInactivity
      );

      window.removeEventListener(
        "focus",
        checkInactivity
      );
    };
  }, [
    user?.id,
    loggingOut,
    sessionTimedOut,
    navigate,
  ]);

  // =====================================================
  // REFRESH SIGNED S3 PHOTO URLS
  // =====================================================

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      setPhotoRefresh(
        (value) => value + 1
      );
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id]);

  // =====================================================
  // LOAD FAMILY MEMBERS FROM DYNAMODB
  // =====================================================

  useEffect(() => {
    if (!user) return;

    let active = true;

    const version =
      ++photoVersionRef.current;

    async function loadMembers() {
      setLoadingMembers(true);
      setMembersError("");

      try {
        const result = await apiRequest(
          "GET",
          "/members"
        );

        if (!active) return;

        const storedPhotos =
          getMemberPhotos();

        const loadedMembers =
          Array.isArray(result.members)
            ? result.members.map(
                (member) => ({
                  ...member,
                  id: member.memberId,
                  photo:
                    storedPhotos[
                      member.memberId
                    ] || "",
                })
              )
            : [];

        setMembers(loadedMembers);

        const photoResults =
          await Promise.allSettled(
            loadedMembers.map(
              async (member) => ({
                id: member.id,
                url: await getPhotoUrl(
                  member.id
                ),
              })
            )
          );

        if (
          !active ||
          version !==
            photoVersionRef.current
        ) {
          return;
        }

        const photoMap = {};

        photoResults.forEach((result) => {
          if (
            result.status ===
            "fulfilled"
          ) {
            photoMap[
              result.value.id
            ] = result.value.url;
          } else {
            console.error(
              "Unable to retrieve family photo:",
              result.reason
            );
          }
        });

        setMembers((previous) =>
          previous.map((member) => ({
            ...member,
            photo:
              photoMap[member.id] !==
              undefined
                ? photoMap[member.id] ||
                  storedPhotos[
                    member.id
                  ] ||
                  ""
                : member.photo,
          }))
        );
      } catch (err) {
        console.error(
          "Unable to load members:",
          err
        );

        if (active) {
          setMembersError(
            err.message ||
              "Unable to load family members."
          );
        }
      } finally {
        if (active) {
          setLoadingMembers(false);
          setInitialMembersReady(true);
        }
      }
    }

    loadMembers();

    return () => {
      active = false;
    };
  }, [user?.id, photoRefresh]);

  // =====================================================
  // LOAD LOGGED-IN USER'S PROFILE PHOTO
  // =====================================================

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadMyPhoto() {
      let fallback = "";

      try {
        fallback = myPhotoKey
          ? localStorage.getItem(
              myPhotoKey
            ) || ""
          : "";
      } catch {
        fallback = "";
      }

      try {
        const url =
          await getPhotoUrl("me");

        if (active) {
          setMyPhoto(
            url || fallback
          );
        }
      } catch (err) {
        console.error(
          "Unable to load my photo:",
          err
        );

        if (active) {
          setMyPhoto(fallback);
        }
      } finally {
        if (active) {
          setInitialPhotoReady(true);
        }
      }
    }

    loadMyPhoto();

    return () => {
      active = false;
    };
  }, [
    user?.id,
    photoRefresh,
    myPhotoKey,
  ]);

  // =====================================================
  // CLOSE PROFILE MODAL
  // =====================================================

  const closeModal = () => {
    photoRequestRef.current += 1;

    setShowAddModal(false);
    setEditingId(null);
    setEditingSelf(false);
    setMemberName("");
    setRelationship("");
    setMemberPhoto("");
    setPhotoChanged(false);
    setProcessingPhoto(false);
    setSaving(false);
    setError("");
  };

  // =====================================================
  // OPEN ADD FAMILY MEMBER MODAL
  // =====================================================

  const openAddModal = () => {
    if (familyLoading) return;

    photoRequestRef.current += 1;

    setEditingSelf(false);
    setEditingId(null);
    setMemberName("");
    setRelationship("");
    setMemberPhoto("");
    setPhotoChanged(false);
    setProcessingPhoto(false);
    setError("");
    setShowAddModal(true);
  };

  // =====================================================
  // OPEN EDIT FAMILY MEMBER MODAL
  // =====================================================

  const openEditModal = (member) => {
    photoRequestRef.current += 1;

    setEditingSelf(false);
    setEditingId(member.id);
    setMemberName(member.name);
    setRelationship(member.relationship);
    setMemberPhoto(member.photo || "");
    setPhotoChanged(false);
    setProcessingPhoto(false);
    setError("");
    setShowAddModal(true);
  };

  // =====================================================
  // OPEN MY PROFILE
  // =====================================================

  const openMyProfile = () => {
    photoRequestRef.current += 1;

    setEditingSelf(true);
    setEditingId(null);
    setMemberName(user.name || "");
    setRelationship("");
    setMemberPhoto(myPhoto);
    setPhotoChanged(false);
    setProcessingPhoto(false);
    setError("");
    setShowAddModal(true);
  };

  // =====================================================
  // HANDLE PROFILE PHOTO SELECTION
  // =====================================================

  const handlePhotoChange = async (event) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(file.type)
    ) {
      setError(
        "Please select a JPG, PNG, or WebP image."
      );
      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setError(
        "Please select an image smaller than 5 MB."
      );
      return;
    }

    const requestId =
      ++photoRequestRef.current;

    setProcessingPhoto(true);
    setError("");

    try {
      const photo =
        await processProfilePhoto(file);

      if (
        requestId !==
        photoRequestRef.current
      ) {
        return;
      }

      setMemberPhoto(photo);
      setPhotoChanged(true);
    } catch (err) {
      if (
        requestId !==
        photoRequestRef.current
      ) {
        return;
      }

      setError(
        err.message ||
          "Unable to process the photo."
      );
    } finally {
      if (
        requestId ===
        photoRequestRef.current
      ) {
        setProcessingPhoto(false);
      }
    }
  };

  // =====================================================
  // REMOVE PROFILE PHOTO
  // =====================================================

  const handleRemovePhoto = () => {
    photoRequestRef.current += 1;

    setProcessingPhoto(false);
    setMemberPhoto("");
    setPhotoChanged(true);
    setError("");
  };

  // =====================================================
  // SAVE PROFILE PHOTO CHANGE
  // =====================================================

  async function savePhotoChange(memberId) {
    if (!photoChanged) {
      return null;
    }

    if (memberPhoto) {
      await uploadPhotoToS3(
        memberId,
        memberPhoto
      );

      const updatedUrl =
        await getPhotoUrl(memberId);

      if (!updatedUrl) {
        throw new Error(
          "Photo uploaded, but AWS could not retrieve it."
        );
      }

      return updatedUrl;
    }

    await deletePhotoFromS3(memberId);

    return "";
  }

  // =====================================================
  // SAVE FAMILY MEMBER / OWN PROFILE
  // =====================================================

  const handleSaveMember = async (event) => {
    event.preventDefault();
    setError("");

    if (
      processingPhoto ||
      saving
    ) {
      return;
    }

    // =================================================
    // SAVE OWN PROFILE PHOTO
    // =================================================

    if (editingSelf) {
      setSaving(true);

      try {
        const result =
          await savePhotoChange("me");

        if (result !== null) {
          setMyPhoto(result);

          if (myPhotoKey) {
            try {
              localStorage.removeItem(
                myPhotoKey
              );
            } catch {
              // Photo is saved in AWS.
            }
          }
        }

        closeModal();
      } catch (err) {
        console.error(
          "Unable to save my photo:",
          err
        );

        setError(
          err.message ||
            "Unable to save your profile photo."
        );
      } finally {
        setSaving(false);
      }

      return;
    }

    const name =
      memberName.trim();

    if (!name) {
      setError(
        "Please enter the family member's name."
      );
      return;
    }

    if (!relationship) {
      setError(
        "Please select a relationship."
      );
      return;
    }

    // =================================================
    // EDIT EXISTING FAMILY MEMBER
    // =================================================

    if (editingId) {
      const existing =
        members.find(
          (member) =>
            member.id === editingId
        );

      if (!existing) {
        setError(
          "Family member not found."
        );
        return;
      }

      if (
        name !== existing.name ||
        relationship !==
          existing.relationship
      ) {
        setError(
          "Saving name or relationship changes requires the AWS update endpoint. We will add that next."
        );
        return;
      }

      setSaving(true);

      try {
        const result =
          await savePhotoChange(
            editingId
          );

        if (result !== null) {
          photoVersionRef.current += 1;

          setMembers((previous) =>
            previous.map((member) =>
              member.id === editingId
                ? {
                    ...member,
                    photo: result,
                  }
                : member
            )
          );

          if (memberPhotosKey) {
            try {
              const photos =
                getMemberPhotos();

              delete photos[
                editingId
              ];

              localStorage.setItem(
                memberPhotosKey,
                JSON.stringify(
                  photos
                )
              );
            } catch {
              // AWS photo is saved.
            }
          }
        }

        closeModal();
      } catch (err) {
        console.error(
          "Unable to update photo:",
          err
        );

        setError(
          err.message ||
            "Unable to update the profile photo."
        );
      } finally {
        setSaving(false);
      }

      return;
    }

    // =================================================
    // CREATE NEW FAMILY MEMBER
    // =================================================

    setSaving(true);

    let createdMember = null;

    try {
      const result =
        await apiRequest(
          "POST",
          "/members",
          {
            name,
            relationship,
          }
        );

      createdMember =
        result.member;

      if (
        !createdMember?.memberId
      ) {
        throw new Error(
          "The server did not return a member ID."
        );
      }

      setMembers((previous) => [
        ...previous,
        {
          ...createdMember,
          id:
            createdMember.memberId,
          photo: "",
        },
      ]);

      if (
        photoChanged &&
        memberPhoto
      ) {
        const photoUrl =
          await savePhotoChange(
            createdMember.memberId
          );

        photoVersionRef.current += 1;

        setMembers((previous) =>
          previous.map((member) =>
            member.id ===
            createdMember.memberId
              ? {
                  ...member,
                  photo:
                    photoUrl || "",
                }
              : member
          )
        );
      }

      closeModal();
    } catch (err) {
      console.error(
        "Unable to create member:",
        err
      );

      if (
        createdMember?.memberId
      ) {
        setError(
          "Family member was saved in DynamoDB, but the photo could not be uploaded. Close this window, open the new member, and try uploading the photo again. " +
            (err.message || "")
        );
      } else {
        setError(
          err.message ||
            "Unable to save family member."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // EXISTING FAMILY MEMBER DELETE HANDLER
  // =====================================================

  const handleDeleteMember = () => {
    setError(
      "Deleting family members requires the AWS DELETE endpoint. We will add that next."
    );
  };

  // =====================================================
  // MANUAL LOGOUT
  // =====================================================

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      await signOut();

      setUser(null);
      setMembers([]);
      setMyPhoto("");

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      console.error(
        "Logout error:",
        err
      );

      setLogoutError(
        "Unable to log out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  };

  // =====================================================
  // SMOOTH LOGOUT SCREEN
  // =====================================================

  if (loggingOut) {
    return (
      <div
        className="dashboard-loading"
        role="status"
        aria-live="polite"
      >
        <div className="dashboard-loading-content">
          <div
            className="dashboard-spinner"
            aria-hidden="true"
          />

          <h2>
            Logging out, please wait...
          </h2>

          <p>
            Securely ending your session
          </p>
        </div>
      </div>
    );
  }

  // =====================================================
  // WAIT FOR COGNITO USER
  // =====================================================

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  // =====================================================
  // DASHBOARD UI
  // =====================================================

  return (
    <div className="dashboard-page">
      <main className="dashboard-container">

        {/* =============================================
            DASHBOARD HEADER
        ============================================= */}

        <header className="dashboard-header">
          <div className="dashboard-user">
            <div className="dashboard-avatar">
              {myPhoto ? (
                <img
                  src={myPhoto}
                  alt="My profile"
                  className="family-profile-photo"
                />
              ) : (
                <UserRound size={32} />
              )}
            </div>

            <div className="dashboard-greeting">
              <h1>
                {user.name ||
                  "Complete your profile"}
              </h1>

              <p>Welcome Back!</p>
            </div>
          </div>

          <div className="dashboard-header-actions">
            <button
              className="dashboard-circle-button"
              aria-label="Calendar"
              onClick={() =>
                setActiveTab("Calendar")
              }
            >
              <CalendarDays size={25} />
            </button>

            <button
              className="dashboard-circle-button"
              aria-label="Notifications"
              onClick={() =>
                setActiveTab("Notifications")
              }
            >
              <Bell size={25} />
            </button>
          </div>
        </header>

        {/* =============================================
            NEW FEATURE: HOME UPLOAD DOCUMENTS

            REPLACES THE OLD SEARCH BAR

            Clicking opens the existing Documents
            component with memberId = "me".

            Documents automatically belong to
            the primary account holder.
        ============================================= */}

        <section className="dashboard-search">
          <button
            type="button"
            onClick={openHomeDocuments}
            aria-label="Upload documents to my profile"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "16px 20px",
              border: "none",
              borderRadius: "16px",
              background: "#7147b5",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
              boxShadow:
                "0 4px 14px rgba(113, 71, 181, 0.18)",
              transition:
                "background 0.2s ease",
            }}
          >
            <UploadCloud
              size={25}
              aria-hidden="true"
            />

            <span>
              Upload Documents
            </span>
          </button>
        </section>

        {/* =============================================
            MY FAMILY SECTION
        ============================================= */}

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>My Family</h2>

            <button
              className="dashboard-icon-button"
              onClick={openAddModal}
              disabled={familyLoading}
              aria-label="Add family member"
            >
              <Pencil size={24} />
            </button>
          </div>

          {membersError && (
            <p
              className="family-form-error"
              role="alert"
            >
              {membersError}
            </p>
          )}

          <div className="family-card">

            {/* MY PROFILE */}

            <button
              type="button"
              className="family-member family-member-button me-member"
              onClick={openMyProfile}
              title="Edit my profile photo"
            >
              <div className="family-avatar me-avatar">
                {myPhoto ? (
                  <img
                    src={myPhoto}
                    alt="My profile"
                    className="family-profile-photo"
                  />
                ) : (
                  <UserRound size={29} />
                )}
              </div>

              <span className="family-member-name">
                Me
              </span>

              <span className="family-member-relation">
                {user.name || "Profile"}
              </span>
            </button>

            {/* EXISTING FAMILY MEMBERS */}

            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className="family-member family-member-button"
                onClick={() =>
                  openEditModal(member)
                }
                title={`Edit ${member.name}`}
              >
                <div className="family-avatar">
                  {member.photo ? (
                    <img
                      src={member.photo}
                      alt={`${member.name}'s profile`}
                      className="family-profile-photo"
                    />
                  ) : (
                    <UserRound size={28} />
                  )}
                </div>

                <span className="family-member-name">
                  {member.name}
                </span>

                <span className="family-member-relation">
                  {member.relationship}
                </span>
              </button>
            ))}

            {/* ADD MEMBER WITH LOADING SPINNER */}

            <button
              type="button"
              className="family-member family-member-button"
              onClick={openAddModal}
              disabled={familyLoading}
              aria-label={
                familyLoading
                  ? "Loading family profiles"
                  : "Add family member"
              }
            >
              <div className="family-avatar add-avatar">
                {familyLoading ? (
                  <div
                    className="family-add-spinner"
                    aria-hidden="true"
                  />
                ) : (
                  <Plus size={30} />
                )}
              </div>

              <span className="family-member-name">
                {familyLoading
                  ? "Loading..."
                  : "Add Member"}
              </span>
            </button>
          </div>
        </section>

        {/* =============================================
            MAIN CATEGORIES
        ============================================= */}

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>Main Categories</h2>

            <button
              className="dashboard-text-button"
              onClick={() =>
                setActiveTab("Category")
              }
            >
              See all
            </button>
          </div>

          <div className="dashboard-categories">
            {CATEGORIES.map((category) => {
              const CategoryIcon =
                category.icon;

              return (
                <button
                  key={category.name}
                  className="dashboard-category-pill"
                  style={{
                    "--category-color":
                      category.color,
                  }}
                  onClick={() =>
                    setActiveTab(
                      category.name
                    )
                  }
                >
                  <CategoryIcon size={26} />

                  <span>
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* =============================================
            NEEDS ATTENTION
        ============================================= */}

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>Needs Attention</h2>

            <button
              className="dashboard-text-button"
              onClick={() =>
                setActiveTab(
                  "Notifications"
                )
              }
            >
              See all
            </button>
          </div>

          <div className="dashboard-attention-card">
            <div className="attention-icon">
              <FileText size={30} />
            </div>

            <div className="attention-content">
              <span className="attention-type">
                Reminders
              </span>

              <h3>
                No reminders yet
              </h3>

              <p>
                Important document renewals
                and reminders will appear here.
              </p>

              <button
                className="attention-action"
                onClick={() =>
                  setActiveTab(
                    "Reminders"
                  )
                }
              >
                Manage Reminders

                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </section>

        {/* =============================================
            OTHER NAVIGATION SECTIONS
        ============================================= */}

        {activeTab !== "Home" && (
          <section className="dashboard-current-tab">
            <h3>
              {activeTab}
            </h3>

            <p>
              This section will be
              implemented in the next phase.
            </p>
          </section>
        )}

        {/* =============================================
            LOGOUT ERROR
        ============================================= */}

        {logoutError && (
          <p
            className="family-form-error"
            role="alert"
          >
            {logoutError}
          </p>
        )}

        {/* =============================================
            LOGOUT BUTTON
        ============================================= */}

        <button
          type="button"
          className="dashboard-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <LogOut size={20} />

          {loggingOut
            ? "Logging out..."
            : "Logout"}
        </button>
      </main>

      {/* =============================================
          BOTTOM NAVIGATION
      ============================================= */}

      <nav className="dashboard-bottom-nav">

        {/* HOME */}

        <button
          className={
            activeTab === "Home"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("Home")
          }
        >
          <Home size={23} />
          <span>Home</span>
        </button>

        {/* MY FAMILY */}

        <button
          className={
            activeTab === "My Family"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("My Family")
          }
        >
          <Users size={23} />
          <span>My Family</span>
        </button>

        {/* ADD FAMILY MEMBER */}

        <button
          className="dashboard-floating-add"
          aria-label="Add family member"
          onClick={openAddModal}
          disabled={familyLoading}
        >
          <Plus size={32} />
        </button>

        {/* CATEGORY */}

        <button
          className={
            activeTab === "Category"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("Category")
          }
        >
          <LayoutGrid size={23} />
          <span>Category</span>
        </button>

        {/* SETTINGS */}

        <button
          className={
            activeTab === "Settings"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("Settings")
          }
        >
          <Settings size={23} />
          <span>Settings</span>
        </button>
      </nav>

      {/* =============================================
          ADD / EDIT PROFILE MODAL
      ============================================= */}

      {showAddModal && (
        <div
          className="family-modal-overlay"
          onClick={() => {
            if (!saving) {
              closeModal();
            }
          }}
        >
          <div
            className="family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="family-modal-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="family-modal-header">
              <h2 id="family-modal-title">
                {editingSelf
                  ? "Edit My Profile"
                  : editingId
                  ? "Edit Family Member"
                  : "Add Family Member"}
              </h2>

              <button
                type="button"
                className="dashboard-icon-button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
              >
                <X size={23} />
              </button>
            </div>

            <form onSubmit={handleSaveMember}>

              {/* PROFILE PHOTO */}

              <div className="family-photo-section">
                <div className="family-photo-preview">
                  {memberPhoto ? (
                    <img
                      src={memberPhoto}
                      alt="Profile photo preview"
                      className="family-profile-photo"
                    />
                  ) : (
                    <UserRound size={38} />
                  )}
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  style={{
                    display: "none",
                  }}
                  aria-label="Select profile photo"
                />

                <button
                  type="button"
                  className="family-upload-photo-button"
                  disabled={
                    processingPhoto ||
                    saving
                  }
                  onClick={() =>
                    photoInputRef.current?.click()
                  }
                >
                  <Camera size={19} />

                  {processingPhoto
                    ? "Processing Photo..."
                    : memberPhoto
                    ? "Change Profile Photo"
                    : "Upload Profile Photo"}
                </button>

                {memberPhoto && (
                  <button
                    type="button"
                    className="family-remove-photo-button"
                    onClick={handleRemovePhoto}
                    disabled={saving}
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              {/* USER OR FAMILY MEMBER DETAILS */}

              {editingSelf ? (
                <div className="family-self-info">
                  <p>
                    <strong>
                      Name:
                    </strong>{" "}
                    {user.name ||
                      "Not provided"}
                  </p>

                  <p>
                    <strong>
                      Email:
                    </strong>{" "}
                    {user.email ||
                      "Not provided"}
                  </p>
                </div>
              ) : (
                <>
                  <label htmlFor="member-name">
                    Full Name
                  </label>

                  <input
                    id="member-name"
                    type="text"
                    placeholder="Enter family member's name"
                    value={memberName}
                    onChange={(event) =>
                      setMemberName(
                        event.target.value
                      )
                    }
                    maxLength={100}
                    required
                  />

                  <label htmlFor="member-relationship">
                    Relationship
                  </label>

                  <select
                    id="member-relationship"
                    value={relationship}
                    onChange={(event) =>
                      setRelationship(
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Select Relationship
                    </option>

                    {RELATIONSHIPS.map(
                      (relation) => (
                        <option
                          key={relation}
                          value={relation}
                        >
                          {relation}
                        </option>
                      )
                    )}
                  </select>
                </>
              )}

              {/* FORM ERROR */}

              {error && (
                <p
                  className="family-form-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {/* SAVE BUTTON */}

              <button
                type="submit"
                className="family-save-button"
                disabled={
                  processingPhoto ||
                  saving
                }
              >
                {saving
                  ? "Saving..."
                  : editingSelf
                  ? "Save My Photo"
                  : editingId
                  ? "Save Changes"
                  : "Create Profile"}
              </button>

              {/* DELETE MEMBER */}

              {editingId &&
                !editingSelf && (
                  <button
                    type="button"
                    className="family-delete-button"
                    onClick={handleDeleteMember}
                    disabled={saving}
                  >
                    <Trash2 size={18} />
                    Delete Member
                  </button>
                )}
            </form>

            {/* =====================================
                EXISTING MANAGE DOCUMENTS BUTTON

                THIS FUNCTIONALITY IS UNCHANGED.

                Family member -> member's ID
                Own profile -> "me"
            ===================================== */}

            {(editingSelf || editingId) && (
              <button
                type="button"
                className="family-save-button"
                style={{
                  marginTop: "12px",
                }}
                onClick={() =>
                  openMemberDocuments(
                    editingSelf
                      ? "me"
                      : editingId,
                    editingSelf
                      ? user.name || "My"
                      : memberName ||
                          "Family member"
                  )
                }
                disabled={
                  saving ||
                  processingPhoto
                }
              >
                <FileText size={18} />

                Manage Documents
              </button>
            )}
          </div>
        </div>
      )}

      {/* =============================================
          SHARED DOCUMENT MANAGER MODAL

          TWO WAYS TO OPEN THIS:

          METHOD 1:
          Family profile -> Manage Documents
          memberId = selected family member

          METHOD 2:
          Home -> Upload Documents
          memberId = "me"

          SAME EXISTING AWS UPLOAD FUNCTIONALITY
      ============================================= */}

      {documentMember && (
        <div
          className="family-modal-overlay"
          onClick={() =>
            setDocumentMember(null)
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Manage family documents"
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              width: "min(96vw, 760px)",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: "24px",
              background: "white",
            }}
          >
            <Documents
              memberId={
                documentMember.memberId
              }
              memberName={
                documentMember.name
              }
              isHomeUpload={documentMember.isHomeUpload === true}
              onClose={() =>
                setDocumentMember(null)
              }
            />
          </div>
        </div>
      )}

      {/* =============================================
          SESSION TIMEOUT MESSAGE
      ============================================= */}

      {sessionTimedOut && (
        <div
          className="family-modal-overlay"
          style={{
            zIndex: 9999,
          }}
        >
          <div
            className="family-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Session Timeout"
            style={{
              maxWidth: "400px",
              textAlign: "center",
              padding: "35px 25px",
            }}
          >
            <h2>
              Session Timeout
            </h2>

            <p>
              Please Login again to continue
              using the application.
            </p>

            <p>
              Redirecting to login...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
