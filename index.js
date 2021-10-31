const express = require('express')
const ejs = require('ejs');
const cookieParser = require("cookie-parser");
const multer = require('multer');


const app = express();
const port = 5553;


// Disable x-powered-by header for express
// app.disable('x-powered-by');

// App Configs
app.locals = require("./locals");;

// App Use
app.use(express.static('public'))
app.use("/static", express.static('static'))

app.set('view engine', 'html');
app.use(express.json());
app.use(cookieParser());
app.engine('html', ejs.renderFile);

const routes = require("./routes.js");


// TODO: Add middleware for session handling


app.get("/", routes.core.index)

app.get("/auth", routes.auth.auth)

app.get("/logout", routes.auth.logout)


app.get("/watch/:show_id", routes.core.view)
// History update
app.post("/watch/:show_id", routes.core.viewPOST)

app.post("/account/upload", multer().single('file'), routes.upload.account)


app.get("/watch/:show_id/:episode_id", routes.core.watch)
app.post("/watch/:show_id/:episode_id", routes.core.watchPOST)


const server = require('http').createServer(app);

server.on('listening', () => {
  console.log("Listening @", port);
})

server.listen(port);