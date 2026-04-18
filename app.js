import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import * as tar from "tar";

const app = express();

const PORT = process.env.PORT || 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =====================
// 📦 STORAGE
// =====================
const STORAGE_DIR = join(__dirname, "public/pkg");
const TMP_DIR = "/tmp/olsp";
const INDEX_FILE = join(STORAGE_DIR, "index.json");

[STORAGE_DIR, TMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// =====================
// 📦 INDEX
// =====================
function loadIndex() {
  try {
    if (!fs.existsSync(INDEX_FILE)) return [];
    const raw = fs.readFileSync(INDEX_FILE, "utf-8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("INDEX ERROR:", e);
    return [];
  }
}

function saveIndex(data) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
}

// =====================
// 📦 MULTER
// =====================
const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  })
});

// =====================
// 📦 READ PACKAGE.JSON
// =====================
async function readPackage(filePath) {
  const tempDir = fs.mkdtempSync("/tmp/olsp-");

  try {
    await tar.x({
      file: filePath,
      cwd: tempDir
    });

    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const full = join(dir, f);

        if (f === "package.json") {
          return JSON.parse(fs.readFileSync(full, "utf-8"));
        }

        if (fs.statSync(full).isDirectory()) {
          const res = walk(full);
          if (res) return res;
        }
      }
      return null;
    };

    return walk(tempDir);
  } catch (e) {
    console.error("READ ERROR:", e);
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// =====================
// 📦 VERSION CHECK
// =====================
function versionExists(name, version) {
  const index = loadIndex();
  return index.some(p => p.name === name && p.version === version);
}

// =====================
// 🌐 VIEW ENGINE
// =====================
app.set("view engine", "ejs");
app.use(express.static(join(__dirname, "public")));

// =====================
// 🌐 ROUTES
// =====================
app.get("/", (req, res) => res.render("index"));

app.get("/p/OLSP", (req, res) => {
  res.render("projects/OLSP/main", {
    packages: loadIndex()
  });
});

app.get("/p/OLSP/upload", (req, res) => {
  res.render("projects/OLSP/upload");
});

// =====================
// 📦 UPLOAD
// =====================
app.post("/api/upload", upload.single("package"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "NO_FILE" });
    }

    const pkg = await readPackage(req.file.path);

    if (!pkg || !pkg.name || !pkg.version) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: "INVALID_PACKAGE" });
    }

    const { name, version, description = "", author = "" } = pkg;

    if (versionExists(name, version)) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({
        ok: false,
        error: "VERSION_ALREADY_EXISTS"
      });
    }

    const finalName = `${name}@${version}.olsp`;
    const finalPath = join(STORAGE_DIR, finalName);

    fs.renameSync(req.file.path, finalPath);

    const index = loadIndex();
    index.push({ name, version, description, author });
    saveIndex(index);

    return res.json({
      ok: true,
      name,
      version,
      url: `/pkg/${name}/${version}`
    });

  } catch (e) {
    console.error("UPLOAD ERROR:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// ❌ запрещаем GET
app.all("/api/upload", (req, res) => {
  res.status(405).send("Use POST");
});

// =====================
// 🚀 START
// =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`OLSP running on ${PORT}`);
});