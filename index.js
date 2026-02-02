require("dotenv").config(); // Load env variables
const express = require("express");
const app = express();
const User = require("./models/user");
const Post = require("./models/post");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");

// Environment variables
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(cookieParser());

// Database connection function
async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected Successfully");
  }
}

// Authentication middleware
const loggedIn = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");

  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (err) {
    console.error("Invalid or expired token:", err.message);
    return res.redirect("/login");
  }
};

// Helper functions
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [array[i], array[randomIndex]] = [array[randomIndex], array[i]];
  }
  return array;
}

function getFileType(filename) {
  const fileExtension = filename.split(".").pop().toLowerCase();
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
  const videoExtensions = ["mp4", "webm", "ogg", "mov", "avi", "flv", "mkv"];

  if (imageExtensions.includes(fileExtension)) return "image";
  if (videoExtensions.includes(fileExtension)) return "video";
  return "unknown";
}

function timeAgo(milliseconds) {
  const timeIntervals = [
    { label: "year", milliseconds: 365 * 24 * 60 * 60 * 1000 },
    { label: "month", milliseconds: 30 * 24 * 60 * 60 * 1000 },
    { label: "week", milliseconds: 7 * 24 * 60 * 60 * 1000 },
    { label: "day", milliseconds: 24 * 60 * 60 * 1000 },
    { label: "hour", milliseconds: 60 * 60 * 1000 },
    { label: "minute", milliseconds: 60 * 1000 },
    { label: "second", milliseconds: 1000 },
  ];

  for (const interval of timeIntervals) {
    const timePassed = Math.floor(milliseconds / interval.milliseconds);
    if (timePassed > 0) {
      return `${timePassed} ${interval.label}${timePassed > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

// Routes

// Home page
app.get("/", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findOne({ username: req.user.username });
  const posts = await Post.find().populate("user");
  res.render("index", {
    user,
    posts,
    time: timeAgo,
    shuffleArray,
    getFileType,
  });
});

// Register page
app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { name, username, password, email } = req.body;
  await connectDB();

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(409).send("User already exists");

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  const createdUser = await User.create({
    name,
    username,
    email,
    password: hash,
  });
  const token = jwt.sign({ username }, JWT_SECRET);
  res.cookie("token", token);

  res.redirect("/");
});

// Login page
app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  await connectDB();

  const user = await User.findOne({ username });
  if (!user) return res.status(404).send("User not found");

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).send("Incorrect Password");

  const token = jwt.sign({ username }, JWT_SECRET);
  res.cookie("token", token);
  res.redirect("/");
});

// Logout
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Profile
app.get("/profile", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findOne({ username: req.user.username }).populate(
    "posts",
  );
  res.render("profile", { user, time: timeAgo, getFileType });
});

// Remove profile picture
app.get("/remove/:img", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findOne({ username: req.user.username });
  user.profilepic = "default.png";
  await user.save();

  const imgPath = `./public/images/profiles/${req.params.img}`;
  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

  res.redirect("/profile");
});

// Multer storage for posts
const postStorage = multer.diskStorage({
  destination: "./public/posts",
  filename: (req, file, cb) => {
    crypto.randomBytes(10, (err, bytes) => {
      if (err) return cb(err);
      cb(null, bytes.toString("hex") + path.extname(file.originalname));
    });
  },
});

// Create post
app.get("/post", loggedIn, (req, res) => res.render("post"));

app.post(
  "/post",
  loggedIn,
  multer({ storage: postStorage }).single("media"),
  async (req, res) => {
    await connectDB();
    const user = await User.findOne({ username: req.user.username });

    const post = await Post.create({
      user: user._id,
      post: req.body.post,
      media: req.file ? req.file.filename : "",
    });

    user.posts.push(post._id);
    await user.save();
    res.redirect("/profile");
  },
);

// Like post
app.get("/like/:id", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findOne({ username: req.user.username });
  const post = await Post.findById(req.params.id);

  const index = post.likes.indexOf(user._id);
  if (index > -1) post.likes.splice(index, 1);
  else post.likes.push(user._id);

  await post.save();
  res.redirect("/");
});

// Edit post
app.get("/edit/:id", loggedIn, async (req, res) => {
  await connectDB();
  const post = await Post.findById(req.params.id);
  res.render("edit", { post });
});

app.post("/edit/:id", loggedIn, async (req, res) => {
  await connectDB();
  const post = await Post.findById(req.params.id);
  post.post = req.body.post;
  await post.save();
  res.redirect("/profile");
});

// Edit profile
app.get("/profile/edit", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findOne({ username: req.user.username });
  res.render("editprofile", { user });
});

const profileStorage = multer.diskStorage({
  destination: "./public/images/profiles",
  filename: (req, file, cb) => {
    crypto.randomBytes(10, (err, bytes) => {
      if (err) return cb(err);
      cb(null, bytes.toString("hex") + path.extname(file.originalname));
    });
  },
});
const upload = multer({ storage: profileStorage });

app.post(
  "/profile/edit",
  loggedIn,
  upload.single("image"),
  async (req, res) => {
    await connectDB();
    const user = await User.findOne({ username: req.user.username });

    if (req.file) user.profilepic = req.file.filename;
    user.name = req.body.name;

    await user.save();
    res.redirect("/profile");
  },
);

// View other user
app.get("/user/:id", loggedIn, async (req, res) => {
  await connectDB();
  const user = await User.findById(req.params.id).populate("posts");
  const loggedUser = await User.findOne({ username: req.user.username });
  res.render("user", { user, time: timeAgo, loggedUser, getFileType });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
