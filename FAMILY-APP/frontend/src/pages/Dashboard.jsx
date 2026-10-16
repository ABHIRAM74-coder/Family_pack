
import { useEffect, useRef, useState } from "react";
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
  Search,
  Mic,
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
} from "lucide-react";

import "./Dashboard.css";

const API_URL =
  "https://df9aajz1zf.execute-api.ap-southeast-2.amazonaws.com";

const INACTIVITY_LIMIT = 60 * 1000;

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

// Cognito authentication token
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

// Authenticated API Gateway request
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

// Compress photo before uploading
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

// Convert JPEG data URL into Blob
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

// Upload profile photo to private S3 bucket
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

// Get temporary photo viewing URL
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

// Delete profile photo from S3
async function deletePhotoFromS3(memberId) {
  await apiRequest("DELETE", "/photos", {
    memberId,
  });
}

function Dashboard() {
  const navigate = useNavigate();

  const photoInputRef = useRef(null);
  const photoRequestRef = useRef(0);
  const photoVersionRef = useRef(0);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState("");

  const [myPhoto, setMyPhoto] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingSelf, setEditingSelf] = useState(false);

  const [memberName, setMemberName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [memberPhoto, setMemberPhoto] = useState("");
  const [photoChanged, setPhotoChanged] = useState(false);

  const [processingPhoto, setProcessingPhoto] =
    useState(false);

  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState("Home");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [logoutError, setLogoutError] = useState("");

  const [photoRefresh, setPhotoRefresh] = useState(0);

  // NEW: Session timeout message state
  const [sessionTimedOut, setSessionTimedOut] =
    useState(false);

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

  // Load Cognito user
  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        const attributes = await fetchUserAttributes();

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
        console.error("Authentication error:", err);

        if (active) {
          navigate("/login", { replace: true });
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
  // NEW FEATURE: 45-SECOND INACTIVITY SESSION TIMEOUT
  // =====================================================
  useEffect(() => {
    if (!user || loggingOut || sessionTimedOut) {
      return;
    }

    let inactivityTimer = null;
    let expired = false;
    let lastActivity = Date.now();

    const expireSession = async () => {
      if (expired) return;

      expired = true;
      clearTimeout(inactivityTimer);

      // Remove listeners immediately to stop further resets.
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

      const elapsed = Date.now() - lastActivity;

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

      // Do not count activity while the tab is hidden.
      if (document.hidden) return;

      // Check elapsed time before accepting new activity.
      // This prevents a late click from reviving an
      // already-expired session.
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
  }, [user?.id, loggingOut, sessionTimedOut, navigate]);

  // Refresh signed S3 URLs before expiration
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      setPhotoRefresh((value) => value + 1);
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id]);

  // Load family members from DynamoDB
  useEffect(() => {
    if (!user) return;

    let active = true;
    const version = ++photoVersionRef.current;

    async function loadMembers() {
      setLoadingMembers(true);
      setMembersError("");

      try {
        const result = await apiRequest(
          "GET",
          "/members"
        );

        if (!active) return;

        const storedPhotos = getMemberPhotos();

        const loadedMembers = Array.isArray(result.members)
          ? result.members.map((member) => ({
              ...member,
              id: member.memberId,
              photo:
                storedPhotos[member.memberId] || "",
            }))
          : [];

        setMembers(loadedMembers);

        const photoResults = await Promise.allSettled(
          loadedMembers.map(async (member) => ({
            id: member.id,
            url: await getPhotoUrl(member.id),
          }))
        );

        if (
          !active ||
          version !== photoVersionRef.current
        ) {
          return;
        }

        const photoMap = {};

        photoResults.forEach((result) => {
          if (result.status === "fulfilled") {
            photoMap[result.value.id] =
              result.value.url;
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
              photoMap[member.id] !== undefined
                ? photoMap[member.id] ||
                  storedPhotos[member.id] ||
                  ""
                : member.photo,
          }))
        );
      } catch (err) {
        console.error("Unable to load members:", err);

        if (active) {
          setMembersError(
            err.message ||
              "Unable to load family members."
          );
        }
      } finally {
        if (active) {
          setLoadingMembers(false);
        }
      }
    }

    loadMembers();

    return () => {
      active = false;
    };
  }, [user?.id, photoRefresh]);

  // Load logged-in user's photo from S3
  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadMyPhoto() {
      let fallback = "";

      try {
        fallback = myPhotoKey
          ? localStorage.getItem(myPhotoKey) || ""
          : "";
      } catch {
        fallback = "";
      }

      try {
        const url = await getPhotoUrl("me");

        if (active) {
          setMyPhoto(url || fallback);
        }
      } catch (err) {
        console.error("Unable to load my photo:", err);

        if (active) {
          setMyPhoto(fallback);
        }
      }
    }

    loadMyPhoto();

    return () => {
      active = false;
    };
  }, [user?.id, photoRefresh, myPhotoKey]);

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

  const openAddModal = () => {
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

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.type
      )
    ) {
      setError(
        "Please select a JPG, PNG, or WebP image."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
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
        requestId !== photoRequestRef.current
      ) {
        return;
      }

      setMemberPhoto(photo);
      setPhotoChanged(true);
    } catch (err) {
      if (
        requestId !== photoRequestRef.current
      ) {
        return;
      }

      setError(
        err.message ||
          "Unable to process the photo."
      );
    } finally {
      if (
        requestId === photoRequestRef.current
      ) {
        setProcessingPhoto(false);
      }
    }
  };

  const handleRemovePhoto = () => {
    photoRequestRef.current += 1;
    setProcessingPhoto(false);
    setMemberPhoto("");
    setPhotoChanged(true);
    setError("");
  };

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

  const handleSaveMember = async (event) => {
    event.preventDefault();
    setError("");

    if (processingPhoto || saving) {
      return;
    }

    // Save own profile photo
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

    const name = memberName.trim();

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

    // Edit family member photo
    if (editingId) {
      const existing = members.find(
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
          await savePhotoChange(editingId);

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

              delete photos[editingId];

              localStorage.setItem(
                memberPhotosKey,
                JSON.stringify(photos)
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

    // Create new family member
    setSaving(true);

    let createdMember = null;

    try {
      const result = await apiRequest(
        "POST",
        "/members",
        {
          name,
          relationship,
        }
      );

      createdMember = result.member;

      if (!createdMember?.memberId) {
        throw new Error(
          "The server did not return a member ID."
        );
      }

      setMembers((previous) => [
        ...previous,
        {
          ...createdMember,
          id: createdMember.memberId,
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
                  photo: photoUrl || "",
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

      if (createdMember?.memberId) {
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

  // Existing backend doesn't yet support
  // deleting DynamoDB family-member records.
  const handleDeleteMember = () => {
    setError(
      "Deleting family members requires the AWS DELETE endpoint. We will add that next."
    );
  };

  // Manual logout
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

  if (loading) {
    return (
      <div className="dashboard-loading">
        Loading your dashboard...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="dashboard-page">
      <main className="dashboard-container">

        {/* HEADER */}
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

        {/* SEARCH BAR */}
        <section className="dashboard-search">
          <Search size={29} />

          <input
            type="search"
            placeholder='Search "Wife Aadhaar Card"'
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            aria-label="Search documents"
          />

          <button
            className="dashboard-icon-button"
            aria-label="Voice search"
            onClick={() =>
              window.alert(
                "Voice search will be added later."
              )
            }
          >
            <Mic size={25} />
          </button>
        </section>

        {/* MY FAMILY */}
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>My Family</h2>

            <button
              className="dashboard-icon-button"
              onClick={openAddModal}
              aria-label="Add family member"
            >
              <Pencil size={24} />
            </button>
          </div>

          {loadingMembers && (
            <p>
              Loading family members...
            </p>
          )}

          {membersError && (
            <p
              className="family-form-error"
              role="alert"
            >
              {membersError}
            </p>
          )}

          <div className="family-card">

            {/* ME PROFILE */}
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

            {/* FAMILY MEMBERS */}
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

            {/* ADD MEMBER */}
            <button
              type="button"
              className="family-member family-member-button"
              onClick={openAddModal}
            >
              <div className="family-avatar add-avatar">
                <Plus size={30} />
              </div>

              <span className="family-member-name">
                Add Member
              </span>
            </button>
          </div>
        </section>

        {/* MAIN CATEGORIES */}
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

        {/* NEEDS ATTENTION */}
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

        {/* OTHER SECTIONS */}
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

        {/* LOGOUT */}
        {logoutError && (
          <p
            className="family-form-error"
            role="alert"
          >
            {logoutError}
          </p>
        )}

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

      {/* BOTTOM NAVIGATION */}
      <nav className="dashboard-bottom-nav">
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

        <button
          className="dashboard-floating-add"
          aria-label="Add family member"
          onClick={openAddModal}
        >
          <Plus size={32} />
        </button>

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

      {/* ADD / EDIT PROFILE MODAL */}
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

              {/* PHOTO UPLOAD */}
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

              {/* USER OR FAMILY DETAILS */}
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

              {error && (
                <p
                  className="family-form-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

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
          </div>
        </div>
      )}

      {/* NEW: SESSION TIMEOUT MESSAGE */}
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
              Please Login again to continue using the application.
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
