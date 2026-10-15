
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

function SetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const phoneNumber = location.state?.phoneNumber;
  const otpVerified = location.state?.otpVerified === true;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError(
        "Use uppercase, lowercase, number and special character."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    // TODO: Integrate secure password setup with Cognito.
    // Never save passwords in localStorage or sessionStorage.
    // Never send passwords through React Router state.

    setError(
      "Password setup will be enabled after Cognito integration."
    );
  };

  if (!phoneNumber || !otpVerified) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Verification Required</h2>
          <p>
            Please complete mobile OTP verification before
            setting your password.
          </p>
          <button onClick={() => navigate("/register")}>
            Start Registration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Family App</h1>
        <h2>Create Your Password</h2>

        <p>Mobile number: {phoneNumber}</p>

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="Create password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirmPassword">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError("");
          }}
          autoComplete="new-password"
          required
        />

        <label>
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) =>
              setShowPassword(e.target.checked)
            }
          />
          Show passwords
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit">Continue</button>
      </form>
    </div>
  );
}

export default SetPassword;
