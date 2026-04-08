const express = require('express');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { randomUUID } = require('crypto');

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */
const PORT = 5000;
const JWT_SECRET = "supersecret";

/* ================= DB ================= */

/* const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "first",
  password: "hassan1212",
  port: 5432,
}); */

const client = new Client({
  user: "first_ifc9_user",
  host: "dpg-d7b4rdffte5s73d4ggag-a",
  database: "first_ifc9",
  password: "INyriCte0Tmbvxtj4cRCvyBqdrrIdJwE",
  port: 5432,
});
client.connect()
  .then(() => console.log("✅ PostgreSQL Connected"))
  .catch(err => console.error("❌ DB Error:", err));

/* ================= SWAGGER ================= */
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ESpend API",
      version: "1.0.0",
    },
    /* servers: [{ url: `http://localhost:${PORT}/api/v1` }], */
    const isProd = process.env.NODE_ENV === "production";

servers: [
  {
    url: isProd
      ? "https://espend.onrender.com/api/v1"
      : `http://localhost:${PORT}/api/v1`
  }
]
  },
  apis: ["./server.js"],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* ================= HELPERS ================= */
const generateToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

/* ================= TABLE INIT ================= */
(async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      full_name TEXT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password TEXT,
      referral_code TEXT,
      wallet_balance NUMERIC DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otps (
      id SERIAL PRIMARY KEY,
      phone TEXT,
      otp TEXT,
      expires_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id UUID PRIMARY KEY,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      password TEXT,
      status TEXT DEFAULT 'pending'
    );
  `);
})();

/* ================= AUTH ================= */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "08012345678"
 *               email:
 *                 type: string
 *                 example: "test@gmail.com"
 *               password:
 *                 type: string
 *                 example: "123456"
 *               fullName:
 *                 type: string
 *                 example: "Hassan"
 *               referralCode:
 *                 type: string
 *                 example: "REF001"
 */
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { phone, email, password, fullName, referralCode } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const user = await client.query(
      `INSERT INTO users(id, full_name, email, phone, password, referral_code)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), fullName, email, phone, hashed, referralCode]
    );

    res.json({ userId: user.rows[0].id, message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/login', async (req, res) => {
  const { phone, password } = req.body;

 const user = await client.query(
  "SELECT * FROM users WHERE phone=$1 OR email=$1",
  [phone]
);

  if (!user.rows.length) return res.status(400).json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.rows[0].password);
  if (!valid) return res.status(400).json({ message: "Invalid password" });

  const token = generateToken({ id: user.rows[0].id });

  res.json({ token, user: user.rows[0] });
});

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Send OTP
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/resend-otp', async (req, res) => {
  const { phone } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await client.query(
    "INSERT INTO otps(phone, otp, expires_at) VALUES($1,$2, NOW() + interval '5 minutes')",
    [phone, otp]
  );

  res.json({ message: "OTP sent", otp });
});

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  const result = await client.query(
    "SELECT * FROM otps WHERE phone=$1 AND otp=$2 ORDER BY id DESC LIMIT 1",
    [phone, otp]
  );

  if (!result.rows.length) return res.status(400).json({ message: "Invalid OTP" });

  const token = generateToken({ phone });

  res.json({ verified: true, token });
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get user
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
app.get('/api/v1/auth/me', async (req, res) => {
  const { id } = req.query;
  const user = await client.query("SELECT * FROM users WHERE id=$1", [id]);
  res.json(user.rows[0]);
});
/**
 * @swagger
 * /auth/me:
 *   put:
 *     summary: Update profile
 *     requestBody:
 *       required: true
 */
app.put('/api/v1/auth/me', async (req, res) => {
  const { id, fullName, email } = req.body;

  await client.query(
    "UPDATE users SET full_name=$1, email=$2 WHERE id=$3",
    [fullName, email, id]
  );

  res.json({ message: "Updated user" });
});
/**
 * @swagger
 * /auth/me:
 *   delete:
 *     summary: Delete account
 *     requestBody:
 *       required: true
 */
app.delete('/api/v1/auth/me', async (req, res) => {
  const { id } = req.body;

  await client.query("DELETE FROM users WHERE id=$1", [id]);

  res.json({ message: "Account deleted" });
});

/* ================= VENDOR ================= */

/**
 * @swagger
 * /auth/vendor/register:
 *   post:
 *     summary: Vendor register
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/vendor/register', async (req, res) => {
  const { companyName, email, phone, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const vendor = await client.query(
    `INSERT INTO vendors(id, company_name, email, phone, password)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [randomUUID(), companyName, email, phone, hashed]
  );

  res.json({ vendorId: vendor.rows[0].id });
});

/**
 * @swagger
 * /auth/vendor/login:
 *   post:
 *     summary: Vendor login
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/vendor/login', async (req, res) => {
  const { email, password } = req.body;

  const vendor = await client.query(
    "SELECT * FROM vendors WHERE email=$1",
    [email]
  );

  if (!vendor.rows.length) return res.status(400).json({ message: "Not found" });

  const valid = await bcrypt.compare(password, vendor.rows[0].password);
  if (!valid) return res.status(400).json({ message: "Invalid password" });

  const token = generateToken({ id: vendor.rows[0].id });

  res.json({ token });
});
/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh token
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/refresh-token', (req, res) => {
  try {
    const { refreshToken } = req.body;

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    const accessToken = generateToken({ id: decoded.id });

    res.json({ accessToken, refreshToken });
  } catch {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/logout', (req, res) => {
  const { deviceId } = req.body;

  // later you can store blocked tokens
  res.json({
    message: "Logged out",
    loggedOutDevices: [deviceId]
  });
});
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Initiate password reset
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  const resetToken = generateToken({ email });

  res.json({
    message: "Reset link sent",
    resetTokenExpiry: "15 minutes",
    resetToken
  });
});
/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Complete password reset
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/reset-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;

  try {
    const decoded = jwt.verify(resetToken, JWT_SECRET);

    const hashed = await bcrypt.hash(newPassword, 10);

    await client.query(
      "UPDATE users SET password=$1 WHERE email=$2",
      [hashed, decoded.email]
    );

    res.json({ message: "Password reset success" });
  } catch {
    res.status(400).json({ message: "Invalid token" });
  }
});
/**
 * @swagger
 * /auth/admin/login:
 *   post:
 *     summary: Admin login
 *     requestBody:
 *       required: true
 */
app.post('/api/v1/auth/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (email === "admin@test.com" && password === "admin123") {
    const token = generateToken({ role: "admin" });

    return res.json({
      token,
      admin: true,
      permissions: ["all"]
    });
  }

  res.status(401).json({ message: "Invalid admin credentials" });
});














app.get('/', (req, res) => {
  res.send('API is running...');
});
/* ================= SERVER ================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
