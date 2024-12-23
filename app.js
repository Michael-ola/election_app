// Project setup
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const xlsx = require("xlsx");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const bodyparser = require("body-parser");
const ejsLayouts = require("express-ejs-layouts");
const app = express();
candidates = require("./public/candidates.json");

// Middleware setup
app.use(ejsLayouts);
app.set("view engine", "ejs");
app.set("layout", "layouts/main");
app.use((req, res, next) => {
  if (req.path === "/admin") {
    res.locals.layout = "layouts/main";
  } else {
    res.locals.layout = false;
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyparser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "secureElection",
    resave: false,
    saveUninitialized: false,
  })
);

// Database connection
mongoose.connect(process.env.DB_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const voterSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  voterId: { type: String, unique: true },
  dateOfBirth: Date,
  email: String,
  hasVoted: { type: Boolean, default: false },
});

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true },
  accessKey: { type: String, required: true },
});

const candidateSchema = new mongoose.Schema({
  name: String,
  politicalParty: String,
  manifesto: String,
  picture: String,
  votes: { type: Number, default: 0 },
});

const Voter = mongoose.model("Voter", voterSchema);
const Admin = mongoose.model("Admin", AdminSchema);
const Candidate = mongoose.model("Candidate", candidateSchema);

// File upload configuration
const upload = multer({ dest: "uploads/" });

// Mailing setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL, // Replace with your email
    pass: process.env.EMAIL_PASS, // Replace with your password
  },
});

// Routes

// Home route
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

// Voter registration
app.get("/register", (req, res) => {
  res.render("register", { title: "Voter registration" });
});

app.post("/register", upload.single("excelFile"), async (req, res) => {
  try {
    if (req.file) {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      await Voter.insertMany(data);
    } else {
      const { firstName, lastName, voterId, dateOfBirth, email } = req.body;
      const voter = new Voter({
        firstName,
        lastName,
        voterId,
        dateOfBirth,
        email,
      });
      await voter.save();
      // Send confirmation email
      await transporter.sendMail({
        from: process.env.EMAIL,
        to: req.body.email,
        subject: "Voter Registration Confirmation",
        text: "You have successfully registered to vote!",
      });
    }

    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.status(500).send("An error occurred");
  }
});

// Login route
app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

app.post("/login", async (req, res) => {
  const { voterId, dateOfBirth } = req.body;
  const voter = await Voter.findOne({ voterId, dateOfBirth });
  if (voter && !voter.hasVoted) {
    req.session.voter = voter;
    res.redirect("/vote");
  } else {
    res.status(401).send("Invalid credentials or you have already voted");
  }
});

// Voting page
app.get("/vote", async (req, res) => {
  if (!req.session.voter) return res.redirect("/login");
  const candidates = await Candidate.find();
  res.render("vote", { title: "Voting Page", candidates });
});

app.post("/vote", async (req, res) => {
  const { candidateId } = req.body;
  if (!req.session.voter) return res.redirect("/login");

  const candidate = await Candidate.findById(candidateId);
  if (candidate) {
    candidate.votes++;
    await candidate.save();

    const voter = await Voter.findById(req.session.voter._id);
    voter.hasVoted = true;
    await voter.save();

    req.session.destroy();
    res.redirect("/login");
  } else {
    res.status(404).send("Candidate not found");
  }
});

// Admin registration
app.get("/admin/register", (req, res) => {
  res.render("adminRegister", { title: "Registration", layout: false });
});

app.post("/admin/register", async (req, res) => {
  const { username, password, email, accessKey } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  // Validate the access key
  if (accessKey !== process.env.ADMIN_ACCESS_KEY) {
    return res.status(403).send("Invalid Access Key. Registration denied.");
  }

  try {
    const admin = new Admin({
      username,
      password: hashedPassword,
      email,
      accessKey,
    });
    await admin.save();
    res.redirect("/admin/login");
  } catch (error) {
    res
      .status(400)
      .send("Registration failed. Ensure username and access key are unique.");
  }
});

// Admin login
app.get("/admin/login", (req, res) => {
  res.render("adminLogin", { title: "Registration", layout: false });
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (admin && (await bcrypt.compare(password, admin.password))) {
    req.session.admin = admin;
    res.redirect("/admin");
  } else {
    res.status(401).send("Login failed. Check your credentials.");
  }
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Could not log out. Please try again.");
    }
    res.redirect("/admin/login");
  });
});

// Admin page
app.get("/admin", async (req, res) => {
  if (!req.session.admin) return res.redirect("/admin/login");
  const candidates = await Candidate.find();
  res.render("admin", { candidates, title: "Registration", layout: false });
});

// Start server
app.listen(process.env.PORT, process.env.IP, function () {
  //app.listen(3000, () => {
  console.log("Server is running");
});
