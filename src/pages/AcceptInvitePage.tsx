import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge, Icon } from "../components/ui";
import { useAuth } from "../contexts/useAuth";
import { teamApi } from "../services/teamApi";

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

export const AcceptInvitePage: React.FC = () => {
  const query = useQuery();
  const token = query.get("token");
  const { isAuthenticated, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
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
        refreshUser();
        setTimeout(() => navigate("/dashboard"), 2000);
      } catch (error) {
        console.error("Error accepting invitation:", error);
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "There was a problem accepting this invitation."
        );
      }
    };

    void accept();
  }, [token, isAuthenticated, navigate, refreshUser]);

  const badgeTone =
    status === "success" ? "success" : status === "error" ? "danger" : status === "accepting" ? "info" : "warning";
  const badgeLabel =
    !token
      ? "Invalid invite"
      : status === "success"
        ? "Invitation accepted"
        : status === "error"
          ? "Invite error"
          : status === "accepting"
            ? "Joining team"
            : "Preparing invite";
  const statusIcon = status === "success" ? "check" : status === "error" ? "warning" : "refresh";
  const toneClass = status === "error" ? "error-message" : status === "success" ? "success-message" : "login-hint auth-status-hint";
  const bodyMessage =
    !token
      ? "This invitation link is missing a token."
      : status === "accepting"
        ? "Accepting your invitation..."
        : status === "success"
          ? message || "You have joined the team successfully. Redirecting..."
          : status === "error"
            ? message || "Unable to accept this invitation."
            : "Preparing to accept your invitation...";

  return (
    <div className="login-container">
      <div className="login-card">
        <Link to="/" className="login-home-button" aria-label="Go to home">
          <Icon name="home" size={18} />
          Home
        </Link>
        <img src="/logo.png" alt="StockStay" className="login-logo" />
        <h1 className="brand-name">
          <span className="brand-stock">Stock</span>
          <span className="brand-stay">Stay</span>
        </h1>
        <p className="login-subtitle">Join team</p>

        <div className="auth-status-stack">
          <div className="auth-status-meta">
            <Badge tone={badgeTone}>{badgeLabel}</Badge>
          </div>
          <div className="auth-status-meta auth-status-icon-row">
            <Icon name={statusIcon} size={24} />
          </div>
          <div className={toneClass} role="status" aria-live="polite">
            {bodyMessage}
          </div>
        </div>
      </div>
    </div>
  );
};
