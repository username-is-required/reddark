const express = require('express');
const helmet = require('helmet');
const http = require('http');

// init a server
const app = express();
app.use(helmet.strictTransportSecurity({
    "preload": true,
    "maxAge": 31536000
}));
const server = http.createServer(app);

app.get('/', (req, res) => {
    return res.redirect(301, "https://reddark.untone.uk/");
});
