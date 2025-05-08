// Dependencias
const express = require("express");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");

// Se crea una instancia de Express
const app = express();
// Se define el puerto en el que se ejecutara el servidor
const PORT = 3000;

// ======================================
// CONFIGURACIÓN GOOGLE DRIVE
// ======================================
// Ruta del archivo de credenciales
const CREDENTIALS_PATH = path.join(__dirname, "google-credentials.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]; // Permiso de solo lectura
const FOLDER_ID = "1Cu4ZmP17u6l9ZsrZBzYtJ_sAbMm9Gezp"; // Id de la carpeta donde estan los archivos

// Autenticación con Google Drive usando credenciales
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(CREDENTIALS_PATH)),
  scopes: SCOPES,
});

// Instancia de la API de Drive (v3)
const drive = google.drive({ version: "v3", auth });

// ======================================
// MIDDLEWARES
// ======================================
app.use(express.json()); // Para parsear JSON en las requests
app.use(
  cors({
    // Configuración CORS permisiva (solo para desarrollo)
    origin: "*",
    methods: ["GET", "HEAD"],
    allowedHeaders: ["Content-Type"],
  })
);

// ======================================
// RUTAS
// ======================================
// Obtener lista de canciones desde Google Drive
app.get("/songs", async (req, res) => {
  try {
    const { q: searchQuery } = req.query;

    let query = `'${FOLDER_ID}' in parents and trashed = false`;

    // Añadir búsqueda por nombre si hay query
    if (searchQuery) {
      query += ` and name contains '${searchQuery}'`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "files(id, name, webContentLink)",
    });

    const songs = response.data.files.map((file) => ({
      id: file.id,
      name: file.name.replace(".opus", ""),
      url: `/stream/${file.id}`,
    }));

    res.json(songs);
  } catch (error) {
    console.error("Error al listar canciones:", error);
    res.status(500).json({ error: "Error al listar canciones" });
  }
});

// Stream de audio desde Google Drive
app.get("/stream/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    // Obtener token de acceso actualizado
    const authClient = await auth.getClient();
    const token = (await authClient.getAccessToken()).token;

    // Obtener metadata del archivo (para el Content-Type)
    const fileInfo = await drive.files.get({
      fileId,
      fields: "mimeType, name",
      auth: authClient,
    });

    // Stream directo desde Google Drive
    const response = await axios({
      method: "get",
      url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      headers: { Authorization: `Bearer ${token}` },
      responseType: "stream",
    });

    // Configurar headers y enviar stream
    res.setHeader("Content-Type", fileInfo.data.mimeType || "audio/mpeg");
    response.data.pipe(res); // Pipe del stream de Drive al response
  } catch (error) {
    console.error("Error al streamear audio:", error);
    res.status(500).json({
      error: "Error al streamear audio",
      details: error.response?.data || error.message,
    });
  }
});

// ======================================
// INICIAR SERVIDOR
// ======================================
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
