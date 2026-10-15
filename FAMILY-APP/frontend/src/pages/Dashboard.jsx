
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCurrentUser,
  fetchUserAttributes,
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

// Compress a photo before saving it in browser storage.
function processProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("Unable to read the selected photo."));
    };

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => {
        reject(new Error("Unable to open the selected image."));
      };

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

function Dashboard() {
  const navigate = useNavigate();
  const photoInputRef = useRef(null);
  const photoRequestRef = useRef(0);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState([]);
  const [myPhoto, setMyPhoto] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingSelf, setEditingSelf] = useState(false);

  const [memberName, setMemberName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [memberPhoto, setMemberPhoto] = useState("");
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [activeTab, setActiveTab] = useState("Home");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const storageKey = user
    ? `family-app-members-${user.id}`
    : null;

  const myPhotoKey = user
    ? `family-app-profile-photo-${user.id}`
    : null;

  // Load authenticated Cognito user.
  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        const attributes = await fetchUserAttributes();

        if (!active) return;

        const registeredName =
          attributes.name?.trim() ||
          attributes.given_name?.trim() ||
          "";

        setUser({
          id: currentUser.userId,
          name: registeredName,
          email: attributes.email || "",
        });
      } catch (err) {
        console.error("Authentication error:", err);

        if (active) {
          navigate("/login", { replace: true });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, [navigate]);

  // Load family members saved for this Cognito user.
  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : [];

      setMembers(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      console.error("Unable to load family members:", err);
      setMembers([]);
    }
  }, [storageKey]);

  // Load logged-in user's own profile photo.
  useEffect(() => {
    if (!myPhotoKey) return;

    try {
      setMyPhoto(localStorage.getItem(myPhotoKey) || "");
    } catch (err) {
      console.error("Unable to load profile photo:", err);
      setMyPhoto("");
    }
  }, [myPhotoKey]);

  const closeModal = () => {
    photoRequestRef.current += 1;
    setShowAddModal(false);
    setEditingId(null);
    setEditingSelf(false);
    setMemberName("");
    setRelationship("");
    setMemberPhoto("");
    setProcessingPhoto(false);
    setError("");
  };

  const openAddModal = () => {
    photoRequestRef.current += 1;
    setEditingSelf(false);
    setEditingId(null);
    setMemberName("");
    setRelationship("");
    setMemberPhoto("");
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
    setProcessingPhoto(false);
    setError("");
    setShowAddModal(true);
  };

  // Open the profile editor for "Me".
  const openMyProfile = () => {
    photoRequestRef.current += 1;
    setEditingSelf(true);
    setEditingId(null);
    setMemberName(user.name || "");
    setRelationship("");
    setMemberPhoto(myPhoto);
    setProcessingPhoto(false);
    setError("");
    setShowAddModal(true);
  };

  // Upload and process a profile photo.
  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Please select a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Please select an image smaller than 5 MB.");
      return;
    }

    const requestId = ++photoRequestRef.current;

    setProcessingPhoto(true);
    setError("");

    try {
      const processedPhoto = await processProfilePhoto(file);

      if (requestId !== photoRequestRef.current) return;

      setMemberPhoto(processedPhoto);
    } catch (err) {
      if (requestId !== photoRequestRef.current) return;

      console.error("Photo processing error:", err);
      setError(err.message || "Unable to process the photo.");
    } finally {
      if (requestId === photoRequestRef.current) {
        setProcessingPhoto(false);
      }
    }
  };

  const handleRemovePhoto = () => {
    photoRequestRef.current += 1;
    setProcessingPhoto(false);
    setMemberPhoto("");
    setError("");
  };

  // Save own photo or add/edit a family member.
  const handleSaveMember = (event) => {
    event.preventDefault();
    setError("");

    if (processingPhoto) {
      setError("Please wait until the photo finishes processing.");
      return;
    }

    // Save logged-in user's own photo.
    if (editingSelf) {
      try {
        if (memberPhoto) {
          localStorage.setItem(myPhotoKey, memberPhoto);
        } else {
          localStorage.removeItem(myPhotoKey);
        }

        setMyPhoto(memberPhoto);
        closeModal();
      } catch (err) {
        console.error("Unable to save own photo:", err);
        setError(
          "Could not save your photo. Browser storage may be full."
        );
      }

      return;
    }

    // Save an added family member.
    const name = memberName.trim();

    if (!name) {
      setError("Please enter the family member's name.");
      return;
    }

    if (!relationship) {
      setError("Please select a relationship.");
      return;
    }

    let updatedMembers;

    if (editingId) {
      updatedMembers = members.map((member) =>
        member.id === editingId
          ? {
              ...member,
              name,
              relationship,
              photo: memberPhoto,
            }
          : member
      );
    } else {
      const newMember = {
        id: crypto.randomUUID(),
        name,
        relationship,
        photo: memberPhoto,
      };

      updatedMembers = [...members, newMember];
    }

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(updatedMembers)
      );

      setMembers(updatedMembers);
      closeModal();
    } catch (err) {
      console.error("Unable to save family member:", err);
      setError(
        "Could not save this member. Browser storage may be full."
      );
    }
  };

  // Delete an added family member.
  const handleDeleteMember = (id) => {
    if (!window.confirm("Delete this family member?")) {
      return;
    }

    const updatedMembers = members.filter(
      (member) => member.id !== id
    );

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(updatedMembers)
      );

      setMembers(updatedMembers);
      closeModal();
    } catch (err) {
      console.error("Unable to delete family member:", err);
      setError("Could not delete this family member.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
      setError("Unable to log out. Please try again.");
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
                {user.name || "Complete your profile"}
              </h1>
              <p>Welcome Back!</p>
            </div>
          </div>

          <div className="dashboard-header-actions">
            <button
              className="dashboard-circle-button"
              aria-label="Calendar"
              onClick={() => setActiveTab("Calendar")}
            >
              <CalendarDays size={25} />
            </button>

            <button
              className="dashboard-circle-button"
              aria-label="Notifications"
              onClick={() => setActiveTab("Notifications")}
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
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search documents"
          />

          <button
            className="dashboard-icon-button"
            aria-label="Voice search"
            onClick={() =>
              window.alert("Voice search will be added later.")
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

            {/* ADDED FAMILY MEMBERS */}
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className="family-member family-member-button"
                onClick={() => openEditModal(member)}
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

            {/* ADD MEMBER BUTTON */}
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
              onClick={() => setActiveTab("Category")}
            >
              See all
            </button>
          </div>

          <div className="dashboard-categories">
            {CATEGORIES.map((category) => {
              const CategoryIcon = category.icon;

              return (
                <button
                  key={category.name}
                  className="dashboard-category-pill"
                  style={{
                    "--category-color": category.color,
                  }}
                  onClick={() => setActiveTab(category.name)}
                >
                  <CategoryIcon size={26} />
                  <span>{category.name}</span>
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
              onClick={() => setActiveTab("Notifications")}
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

              <h3>No reminders yet</h3>

              <p>
                Important document renewals and reminders
                will appear here.
              </p>

              <button
                className="attention-action"
                onClick={() => setActiveTab("Reminders")}
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
            <h3>{activeTab}</h3>
            <p>
              This section will be implemented
              in the next phase.
            </p>
          </section>
        )}

        {/* LOGOUT */}
        {activeTab === "Settings" && (
          <button
            className="dashboard-logout"
            onClick={handleLogout}
          >
            <LogOut size={20} />
            Logout
          </button>
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="dashboard-bottom-nav">
        <button
          className={activeTab === "Home" ? "active" : ""}
          onClick={() => setActiveTab("Home")}
        >
          <Home size={23} />
          <span>Home</span>
        </button>

        <button
          className={
            activeTab === "My Family" ? "active" : ""
          }
          onClick={() => setActiveTab("My Family")}
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
            activeTab === "Category" ? "active" : ""
          }
          onClick={() => setActiveTab("Category")}
        >
          <LayoutGrid size={23} />
          <span>Category</span>
        </button>

        <button
          className={
            activeTab === "Settings" ? "active" : ""
          }
          onClick={() => setActiveTab("Settings")}
        >
          <Settings size={23} />
          <span>Settings</span>
        </button>
      </nav>

      {/* ADD / EDIT PROFILE MODAL */}
      {showAddModal && (
        <div
          className="family-modal-overlay"
          onClick={closeModal}
        >
          <div
            className="family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="family-modal-title"
            onClick={(event) => event.stopPropagation()}
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
                  style={{ display: "none" }}
                  aria-label="Select profile photo"
                />

                <button
                  type="button"
                  className="family-upload-photo-button"
                  disabled={processingPhoto}
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
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              {editingSelf ? (
                <div className="family-self-info">
                  <p>
                    <strong>Name:</strong>{" "}
                    {user.name || "Not provided"}
                  </p>
                  <p>
                    <strong>Email:</strong>{" "}
                    {user.email || "Not provided"}
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
                      setMemberName(event.target.value)
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
                      setRelationship(event.target.value)
                    }
                    required
                  >
                    <option value="">
                      Select Relationship
                    </option>

                    {RELATIONSHIPS.map((relation) => (
                      <option
                        key={relation}
                        value={relation}
                      >
                        {relation}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {error && (
                <p className="family-form-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="family-save-button"
                disabled={processingPhoto}
              >
                {editingSelf
                  ? "Save My Photo"
                  : editingId
                  ? "Save Changes"
                  : "Create Profile"}
              </button>

              {editingId && !editingSelf && (
                <button
                  type="button"
                  className="family-delete-button"
                  onClick={() =>
                    handleDeleteMember(editingId)
                  }
                >
                  <Trash2 size={18} />
                  Delete Member
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
