
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut,
} from "aws-amplify/auth";

function Welcome() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        await getCurrentUser();

        const attributes = await fetchUserAttributes();

        if (!active) return;

        if (!attributes.name || !attributes.birthdate) {
          navigate("/user-details", {
            replace: true,
            state: {
              email: attributes.email,
              authenticated: true,
            },
          });
          return;
        }

        setName(attributes.name);
      } catch (err) {
        console.error("Session check failed:", err);

        if (active) {
          navigate("/login", { replace: true });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout failed:", err);
      setError("Unable to log out. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Family App</h1>
        <h2>Welcome, {name}!</h2>

        <p>You have successfully logged in.</p>

        <p>
          Your personal dashboard will be added
          in the next phase.
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default Welcome;
