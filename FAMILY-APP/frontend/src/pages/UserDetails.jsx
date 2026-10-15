
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  signIn,
  updateUserAttributes,
  signOut,
} from "aws-amplify/auth";

function UserDetails() {
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || "";

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Use local date, not UTC
  const today = [
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    String(new Date().getDate()).padStart(2, "0"),
  ].join("-");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const name = fullName.trim();

    if (name.length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!dateOfBirth || dateOfBirth > today) {
      setError("Please enter a valid date of birth.");
      return;
    }

    if (!password) {
      setError("Enter your account password.");
      return;
    }

    setLoading(true);

    try {
      // Authenticate the confirmed Cognito user
      const result = await signIn({
        username: email,
        password,
      });

      if (!result.isSignedIn) {
        setError(
          "Additional authentication is required: " +
          result.nextStep.signInStep
        );
        return;
      }

      // Save profile to the authenticated Cognito account
      const updateResult = await updateUserAttributes({
        userAttributes: {
          name,
          birthdate: dateOfBirth,
        },
      });

      const pendingVerification = Object.values(
        updateResult
      ).some(
        (attribute) =>
          attribute.nextStep?.updateAttributeStep ===
          "CONFIRM_ATTRIBUTE_WITH_CODE"
      );

      if (pendingVerification) {
        setError(
          "Your profile requires additional attribute verification."
        );
        return;
      }

      // End registration session so user can log in normally
      await signOut();

      navigate("/login", {
        replace: true,
        state: {
          message:
            "Registration completed! Please log in.",
        },
      });
    } catch (err) {
      console.error("Profile setup error:", err);
      setError(
        err.message ||
        "Unable to complete registration. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Family App</h1>
          <h2>Registration Required</h2>
          <p>
            Please verify your email address first.
          </p>
          <Link to="/register">Start Registration</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Family App</h1>
        <h2>Complete Your Profile</h2>

        <p>
          Verified email: <strong>{email}</strong>
        </p>

        <label htmlFor="fullName">Full Name</label>
        <input
          id="fullName"
          type="text"
          placeholder="Enter your full name"
          autoComplete="name"
          maxLength={100}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />

        <label htmlFor="dob">Date of Birth</label>
        <input
          id="dob"
          type="date"
          max={today}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          required
        />

        <label htmlFor="password">
          Confirm Your Account Password
        </label>
        <input
          id="password"
          type="password"
          placeholder="Enter your registered password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading
            ? "Saving Profile..."
            : "Complete Registration"}
        </button>
      </form>
    </div>
  );
}

export default UserDetails;
