const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { RecaptchaEnterpriseServiceClient } = require("@google-cloud/recaptcha-enterprise");

const app = express();
const PORT = process.env.PORT || 8080;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "chefos-502422";
const LOCATION = process.env.GCP_REGION || "us-central1";

// Middlewares de seguridad y parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Servir archivos estáticos (index.html, etc.)
app.use(express.static("."));

// Inicialización de Google Gen AI cliente (soporta Vertex AI con ADC o GEMINI_API_KEY)
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({ apiKey: apiKey })
  : new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: LOCATION });

const recaptchaClient = new RecaptchaEnterpriseServiceClient();

// 1. Health Checks
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.get("/readyz", (req, res) => res.status(200).send("READY"));

// 2. Endpoint de Generación con Gemini / Vertex AI
app.post("/api/ai/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "El campo \"prompt\" es requerido." });
    }

    const modelName = process.env.GEMINI_MODEL || (apiKey ? "gemini-2.5-flash" : "gemini-1.5-flash");

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });

    return res.status(200).json({
      success: true,
      data: response.text
    });
  } catch (error) {
    console.error("Error invocando Vertex AI (Gemini):", error);
    return res.status(500).json({
      error: "Error interno procesando la solicitud con Vertex AI",
      details: error.message
    });
  }
});

// 3. Endpoint de Verificación de reCAPTCHA Enterprise
app.post("/api/auth/verify-recaptcha", async (req, res) => {
  try {
    const { token, recaptchaAction } = req.body;
    const siteKey = process.env.RECAPTCHA_SITE_KEY || "6Lc6v7gtAAAAAPYVODf4-6g1NTwkOqguBVUIVqdy";

    if (!token || !siteKey) {
      return res.status(400).json({ error: "Faltan parámetros de validación o clave de sitio." });
    }

    const projectPath = recaptchaClient.projectPath(PROJECT_ID);
    const request = {
      parent: projectPath,
      assessment: {
        event: {
          token: token,
          siteKey: siteKey,
        },
      },
    };

    const [response] = await recaptchaClient.createAssessment(request);

    if (!response.tokenProperties || !response.tokenProperties.valid) {
      return res.status(403).json({
        valid: false,
        reason: response.tokenProperties ? response.tokenProperties.invalidReason : "INVALID_TOKEN"
      });
    }

    if (recaptchaAction && response.tokenProperties.action !== recaptchaAction) {
      return res.status(403).json({
        valid: false,
        reason: "Action mismatch"
      });
    }

    return res.status(200).json({
      valid: true,
      score: response.riskAnalysis.score,
      reasons: response.riskAnalysis.reasons
    });
  } catch (error) {
    console.error("Error evaluando reCAPTCHA:", error);
    return res.status(500).json({ error: "Fallo en la evaluación de seguridad." });
  }
});

// Inicio del servidor
const server = app.listen(PORT, () => {
  console.log(`ChefOS Backend operativo en puerto ${PORT}`);
});

// 4. Graceful Shutdown (SIGTERM / SIGINT)
const gracefulShutdown = (signal) => {
  console.log(`Señal ${signal} recibida. Cerrando conexiones HTTP limpiamente...`);
  server.close(() => {
    console.log("Servidor HTTP cerrado. Proceso finalizado.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forzando apagado por timeout...");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
