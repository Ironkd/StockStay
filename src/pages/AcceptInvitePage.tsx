import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { teamApi } from "../services/teamApi";
import { useAuth } from "../contexts/AuthContext";

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

export const AcceptInvitePage: React.FC = () => {
  const query = useQuery();
  const token = query.get("token");
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const accept = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing invitation token.");
        return;
      }
      if (!isAuthenticated) {
        const returnPath = `/accept-invite?token=${encodeURIComponent(token)}`;
        navigate(`/login?mode=signup&redirect=${encodeURIComponent(returnPath)}`);
        return;
      }

      try {
        setStatus("accepting");
        const response = await teamApi.acceptInvitation(token);
        setStatus("success");
        setMessage(response.message);
        // After a short delay, return to home
        setTimeout(() => navigate("/dashboard"), 2000);
      } catch (error) {
        console.error("Error accepting invitation:", error);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "There was a problem accepting this invitation."
        );
      }
    };

    accept();
  }, [token, isAuthenticated, navigate]);

  return (
    <div className="settings-page">
      <h2>Join Team</h2>
      {!token ? (
        <p>This invitation link is missing a token.</p>
      ) : status === "accepting" ? (
        <p>Accepting your invitation...</p>
      ) : status === "success" ? (
        <p>{message || "You have joined the team successfully. Redirecting..."}</p>
      ) : status === "error" ? (
        <p>{message || "Unable to accept this invitation."}</p>
      ) : (
        <p>Preparing to accept your invitation...</p>
      )}
    </div>
  );
};

