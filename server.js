const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SITE_KEY = "6LeNx7gtAAAAAPCFE5ZnK_cU7WWgba-_4UIDe7YK";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "chefos-502422";
const API_KEY = process.env.GCP_API_KEY || "";

// Health Check
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "ChefOS Backend API",
    project: GCP_PROJECT_ID,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/verify-recaptcha", async (req, res) => {
  const { token, action } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token de reCAPTCHA requerido" });
  }

  // Endpoint oficial de evaluación para el proyecto chefos-502422
  const endpoint = API_KEY 
    ? `https://recaptchaenterprise.googleapis.com/v1/projects/${GCP_PROJECT_ID}/assessments?key=${API_KEY}`
    : `https://recaptchaenterprise.googleapis.com/v1/projects/${GCP_PROJECT_ID}/assessments`;

  const payload = {
    event: {
      token: token,
      expectedAction: action || "LOGIN",
      siteKey: SITE_KEY
    }
  };

  try {
    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await apiResponse.json();

    if (!data.tokenProperties || !data.tokenProperties.valid) {
      return res.status(400).json({
        success: false,
        reason: data.tokenProperties ? data.tokenProperties.invalidReason : "Token inválido",
        data
      });
    }

    const score = data.riskAnalysis ? data.riskAnalysis.score : 0;

    return res.json({
      success: score >= 0.5,
      score: score,
      action: data.tokenProperties.action,
      reasons: data.riskAnalysis ? data.riskAnalysis.reasons : []
    });
  } catch (error) {
    console.error("Error al validar reCAPTCHA Enterprise:", error);
    return res.status(500).json({ error: "Error interno en la verificación" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
