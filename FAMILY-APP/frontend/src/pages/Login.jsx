
import { useState } from "react";
import {
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";

import {
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
} from "aws-amplify/auth";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const successMessage = location.state?.message;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      // Check whether Cognito already has a signed-in user.
      let existingUser = null;

      try {
        existingUser = await getCurrentUser();
      } catch {
        // No authenticated session exists.
      }

      if (existingUser) {
        // Sign out the existing account before authenticating
        // the account entered in this login form.
        await signOut();
      }

      // Authenticate the entered account with Cognito.
      const result = await signIn({
        username: normalizedEmail,
        password,
        options: {
          authFlowType: "USER_SRP_AUTH",
        },
      });

      if (result.isSignedIn) {
        // Verify the newly authenticated account.
        const currentUser = await getCurrentUser();
        const attributes = await fetchUserAttributes();

        console.log("Authenticated Cognito user:", {
          userId: currentUser.userId,
          email: attributes.email,
          name: attributes.name,
        });

        // Open the dashboard for the authenticated account.
        navigate("/dashboard", {
          replace: true,
        });
      } else {
        const step = result.nextStep?.signInStep;

        if (step === "CONFIRM_SIGN_UP") {
          navigate("/verify-otp", {
            state: {
              email: normalizedEmail,
            },
          });
        } else {
          setError(
            "Additional authentication step required: " +
              (step || "Unknown")
          );
        }
      }
    } catch (err) {
      console.error("Login error:", err);

      if (err.name === "UserNotConfirmedException") {
        navigate("/verify-otp", {
          state: {
            email: normalizedEmail,
          },
        });
      } else {
        setError(
          err.message ||
            "Login failed. Please check your credentials."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form
        className="auth-card"
        onSubmit={handleLogin}
      >
        <h1>Family App</h1>
        <h2>Welcome Back</h2>

        <p>
          Login using your registered email address.
        </p>

        {successMessage && (
          <p
            role="status"
            style={{ color: "#86efac" }}
          >
            {successMessage}
          </p>
        )}

        <label htmlFor="email">
          Email Address
        </label>

        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          required
        />

        <label htmlFor="password">
          Password
        </label>

        <input
          id="password"
          type={
            showPassword ? "text" : "password"
          }
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          required
        />

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) =>
              setShowPassword(e.target.checked)
            }
          />
          Show Password
        </label>

        {error && (
          <p
            className="error"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Logging in..."
            : "Login"}
        </button>

        <p>
          Don't have an account?{" "}
          <Link to="/register">
            Register Here
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Login;
