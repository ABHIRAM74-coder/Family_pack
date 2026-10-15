
import { useState } from "react";
import {
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";

import {
  confirmSignUp,
  resendSignUpCode,
} from "aws-amplify/auth";

function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const email = (
    location.state?.email || ""
  ).trim().toLowerCase();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email) {
      setError(
        "Email address is missing. Please register again."
      );
      return;
    }

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);

    try {
      const result = await confirmSignUp({
        username: email,
        confirmationCode: otp.trim(),
      });

      if (result.isSignUpComplete) {
        navigate("/login", {
          replace: true,
          state: {
            message:
              "Account verified successfully! Please log in.",
          },
        });
      } else {
        setError(
          "Verification is not complete. Please try again."
        );
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      setError(
        err.message ||
          "OTP verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setMessage("");

    if (!email) {
      setError(
        "Email address is missing. Please register again."
      );
      return;
    }

    setResending(true);

    try {
      await resendSignUpCode({
        username: email,
      });

      setMessage(
        "A new verification code has been sent to your email."
      );
    } catch (err) {
      console.error("Resend OTP error:", err);
      setError(
        err.message ||
          "Unable to resend OTP."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-container">
      <form
        className="auth-card"
        onSubmit={handleVerify}
      >
        <h1>Family App</h1>
        <h2>Verify Your Email</h2>

        <p>
          Enter the 6-digit verification code
          sent to your registered email.
        </p>

        {email && (
          <p>
            <strong>{email}</strong>
          </p>
        )}

        <label htmlFor="otp">
          Email Verification Code
        </label>

        <input
          id="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="Enter 6-digit OTP"
          value={otp}
          onChange={(e) => {
            setOtp(
              e.target.value.replace(/\D/g, "")
            );
            setError("");
          }}
          required
        />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p role="status" style={{ color: "#86efac" }}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Verifying..."
            : "Verify Email"}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
        >
          {resending
            ? "Sending..."
            : "Resend OTP"}
        </button>

        <p>
          Already verified?{" "}
          <Link to="/login">
            Login Here
          </Link>
        </p>
      </form>
    </div>
  );
}

export default VerifyOTP;
