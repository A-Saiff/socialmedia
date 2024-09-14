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

const uri = "mongodb://127.0.0.1:27017/socialmedia";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(cookieParser());

const loggedIn = (req, res, next) => {
  let token = req.cookies.token;
  if (token) {
    try {
      let data = jwt.verify(token, "SOCIAL");
      req.user = data;
      next();
    } catch (err) {
      console.log("Invalid or expired token", err.message);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
};

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1)); // Get a random index
    [array[i], array[randomIndex]] = [array[randomIndex], array[i]]; // Swap elements
  }
  return array;
}

app.get("/", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let user = await User.findOne({ username: req.user.username });
  let posts = await Post.find().populate("user");
  await mongoose.connection.close();
  res.render("index", { user, posts, time: timeAgo, shuffleArray });
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", (req, res) => {
  const { name, username, password, email } = req.body;
  mongoose.connect(uri).then(async () => {
    console.log("Connected");

    let user = await User.findOne({ username });
    if (user) {
      mongoose.connection.close().then(() => console.log("Connection closed"));
      return res.status(409).send("User already exists");
    }

    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(password, salt, async (err, hash) => {
        let createdUser = await User.create({
          name,
          username,
          email,
          password: hash,
        });

        let token = jwt.sign({ username }, "SOCIAL");
        res.cookie("token", token);

        mongoose.connection
          .close()
          .then(() => console.log("Connection closed"));
        res.redirect("/");
      });
    });
  });
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

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

  return "just now"; // When the milliseconds are less than a second
}

app.get("/profile", loggedIn, async (req, res) => {
  let username = req.user.username;
  await mongoose.connect(uri);
  let user = await User.findOne({ username }).populate("posts");
  await mongoose.connection.close();
  res.render("profile", { user, time: timeAgo });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  mongoose.connect(uri).then(() => {
    User.findOne({ username }).then((user) => {
      mongoose.connection.close().then(() => console.log("Closed connection"));
      if (!user) {
        return res.status(404).send("User not found");
      }
      bcrypt.compare(password, user.password).then((result) => {
        if (result) {
          let token = jwt.sign({ username }, "SOCIAL");
          res.cookie("token", token);
          return res.redirect("/");
        }
        res.status(401).send("Incorrect Password");
      });
    });
  });
});

app.get("/post", loggedIn, (req, res) => {
  res.render("post");
});

app.get("/remove/:img", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let user = await User.findOne({ username: req.user.username });
  user.profilepic = "default.png";
  await user.save();
  await mongoose.connection.close();
  fs.unlinkSync(`./public/images/profiles/${req.params.img}`);
  res.redirect("/profile");
});

app.post("/post", loggedIn, async (req, res) => {
  let { username } = req.user;
  await mongoose.connect(uri);
  let user = await User.findOne({ username });
  let post = await Post.create({
    user: user._id,
    post: req.body.post,
  });
  user.posts.push(post._id);
  await user.save();
  await mongoose.connection.close();
  res.redirect("/profile");
});

app.get("/like/:id", loggedIn, async (req, res) => {
  let { username } = req.user;
  await mongoose.connect(uri);
  let user = await User.findOne({ username });
  let post = await Post.findOne({ _id: req.params.id });
  if (post.likes.includes(user._id)) {
    post.likes.splice(post.likes.indexOf(user._id), 1);
  } else {
    post.likes.push(user._id);
  }
  await post.save();
  await mongoose.connection.close();
  res.redirect("/");
});

app.get("/edit/:id", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let post = await Post.findOne({ _id: req.params.id });
  await mongoose.connection.close();
  res.render("edit", { post });
});

app.post("/edit/:id", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let post = await Post.findOne({ _id: req.params.id });
  post.post = req.body.post;
  await post.save();
  await mongoose.connection.close();
  res.redirect("/profile");
});

app.get("/profile/edit", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let user = await User.findOne({ username: req.user.username });
  await mongoose.connection.close();
  res.render("editprofile", { user });
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/images/profiles");
  },
  filename: function (req, file, cb) {
    crypto.randomBytes(10, (err, bytes) => {
      let fn = bytes.toString("hex") + path.extname(file.originalname);
      cb(null, fn);
    });
  },
});
const upload = multer({ storage });

app.post(
  "/profile/edit",
  loggedIn,
  upload.single("image"),
  async (req, res) => {
    await mongoose.connect(uri);
    let user = await User.findOne({ username: req.user.username });
    if (req.file) {
      user.profilepic = req.file.filename;
    }
    user.name = req.body.name;
    await user.save();
    await mongoose.connection.close();
    res.redirect("/profile");
  }
);

app.get("/user/:id", loggedIn, async (req, res) => {
  await mongoose.connect(uri);
  let user = await User.findOne({ _id: req.params.id }).populate("posts");
  let loggedUser = await User.findOne({ username: req.user.username });
  await mongoose.connection.close();
  res.render("user", { user, time: timeAgo, loggedUser });
});

app.listen(3000);
