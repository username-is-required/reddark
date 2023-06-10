const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

var request = require("./requests.js");
var config = require("./config.js")

// init a server
const app = express();
const server = http.createServer(app);

// init the websocket stuff
const io = new Server(server, {
    cors: {
        origin: config.url,
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true
    },
    allowEIO3: true
});

// set up the static files - index.html and the public directory
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.use(express.static('public'))

const subreddits_src = {

}
const subreddits = {};

// a function to fetch data from a url and validate that it is JSON
// it is persistent and will keep trying until it gets valid JSON
async function fetchValidJsonData(url) {
    return new Promise((resolve, reject) => {
        var data = await request.httpsGet(url);
        
        try {
            data = JSON.parse(data);
        } catch (err) {
            console.log("Request to Reddit errored (bad JSON) [will retry] - " + data);
            
            // now we wait for 10 seconds and try it again!
            // 'resolving' the promise with...uhh, recursion
            setTimeout(
                resolve(await fetchValidJsonData(url)),
                10000
            );
        }
        
        // if we're here, we have valid json
        resolve(data);
    });
}

async function appendList(url) {
    var section = [];
    var sectionname = "";
    
    data = await fetchValidJsonData(url);
    
    text = data[0]['data']['children'][0]['data']['selftext'];
    //console.log(text);
    lines = text.split("\n");
    for (var line of lines) {
        if (line.startsWith("##") && !line.includes("Please") && line.includes(":")) {
            if (section != []) subreddits_src[sectionname] = section;
            section = [];
            sectionname = line.replace("##", "");
        }
        if (line.startsWith("r/")) {
            section.push(line);
        }
    }
    subreddits_src[sectionname] = section;
}
async function createList() {
    await appendList("/r/ModCoord/comments/1401qw5/incomplete_and_growing_list_of_participating.json")
    await appendList("/r/ModCoord/comments/143fzf6/incomplete_and_growing_list_of_participating.json");
    console.log("grabbed subreddits");
    //subreddits_src["30+ million:"].push("r/tanzatest")

    for (var section in subreddits_src) {
        console.log(section);
        subreddits[section] = [];
        for (var subreddit in subreddits_src[section]) {
            subreddits[section].push({
                "name": subreddits_src[section][subreddit],
                "status": "public"
            });
        }
    }
    console.log(subreddits);
    return;
}



firstCheck = false;
var countTimeout = null;
io.on('connection', (socket) => {
    if (firstCheck == false) {
        socket.emit("loading");
    } else {
        socket.emit("subreddits", subreddits);
    }
    clearTimeout(countTimeout);
    countTimeout = setTimeout(() => {
        console.log('currently connected users: ' + io.engine.clientsCount);
    }, 500);
});

server.listen(config.port, () => {
    console.log('listening on *:' + config.port);
});
var checkCounter = 0;

async function updateStatus() {
    return new Promise((resolve, reject) => {
        var httpsRequests = [];
        const stackTrace = new Error().stack
        checkCounter++;
        console.log("Starting check " + checkCounter + " with stackTrace: " + stackTrace);
        for (let section in subreddits) {
            for (let subreddit in subreddits[section]) {
                const httpsReq = request.httpsGet("/" + subreddits[section][subreddit].name + ".json").then((data) =
                    try {
                        data = JSON.parse(data);
                    } catch (err) {
                        console.log("Request to Reddit errored (bad JSON) - " + data);
                        // error handling? the app will assume the sub is public
                        return;
                    }
                    
                    if (typeof (resp['message']) != "undefined" && resp['error'] == 500) {
                        console.log("Request to Reddit errored (500) - " + resp);
                        // error handling? the app will assume the sub is public
                        return;
                    }
                    
                    if (typeof (resp['reason']) != "undefined" && resp['reason'] == "private" && subreddits[section][subreddit].status != "private") {
                        // the subreddit is private and the app doesn't know about it yet
                        subreddits[section][subreddit].status = "private";
                        if (firstCheck == false) {
                            io.emit("update", subreddits[section][subreddit]);
                        } else {
                            io.emit("updatenew", subreddits[section][subreddit]);
                        }
                    } else if (subreddits[section][subreddit].status == "private" && typeof (resp['reason']) == "undefined") {
                        // the subreddit is public but the app thinks it's private
                        console.log("updating to public with data - " + resp);
                        subreddits[section][subreddit].status = "public";
                        io.emit("updatenew", subreddits[section][subreddit]);
                    }
                }).catch((err) => {
                    if (err.message == "timed out") {
                        console.log("Request to Reddit timed out");
                    } else {
                        console.log("Request to Reddit errored - " + err);
                    }
                    
                    // error handling? the app will assume the sub is public
                });
                
                httpsRequests.push(httpsReq);
            }
        }
        
        await Promise.all(httpsRequests);
        
        // all requests have now either been completed or errored
        if (!firstCheck) {
            io.emit("subreddits", subreddits);
            firstCheck = true;
        }
        
        // the updating is now complete, resolve the promise
        resolve();
    }
}

// this function calls updateStatus to check/update the status of
// the subreddits, then uses setTimeout to wait for the amount of
// time specified in the config before the function is called again.
async function continuouslyUpdate() {
    await updateStatus();
    setTimeout(continuouslyUpdate, config.updateInterval); // interval between updates set in the config file
}

// builds the list of subreddits, then starts the continuous
// updating of the subreddit statuses
async function run() {
    await createList();
    continuouslyUpdate();
}


run();
