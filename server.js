const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SITE_KEY = "6LeNx7gtAAAAAPqpo5Hcnn7-JCpOp_GML8W6T01N";
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "chef4youbyfranko";
const API_KEY = process.env.GCP_API_KEY || "TU_API_KEY_AQUI";

app.post("/api/verify-recaptcha", async (req, res) => {
  const { token, action } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token de reCAPTCHA requerido" });
  }

  // Endpoint oficial de evaluación para el proyecto chef4youbyfranko
  const endpoint = `https://recaptchaenterprise.googleapis.com/v1/projects/${GCP_PROJECT_ID}/assessments?key=${API_KEY}`;

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
