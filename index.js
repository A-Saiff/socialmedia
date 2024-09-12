const express = require("express");
const app = express();
const User = require("./models/user");
const Post = require("./models/post");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const uri = "mongodb://127.0.0.1:27017/socialmedia";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

app.get("/", loggedIn, (req, res) => {
  res.render("index");
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

app.listen(3000);
