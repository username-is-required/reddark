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

// a function to fetch data from a url and validate that it is JSON
// it is persistent and will keep trying until it gets valid JSON
function fetchValidJsonData(url) {
    return new Promise(async (resolve, reject) => {
        var data = await request.httpsGet(url);
        
        try {
            data = JSON.parse(data);
            resolve(data);
        } catch (err) {
            console.log("Request to Reddit errored (bad JSON) [will retry] - " + data);
            
            // now we wait for 10 seconds and try it again!
            // 'resolving' the promise with...uhh, recursion
            setTimeout(async () => {
              data = await fetchValidJsonData(url);
              resolve(data);
            }, 10000);
        }
    });
}

const subreddits_src = {

}
const subreddits = {};

async function appendList(url) {
    var section = [];
    var sectionname = "";
    
    data = await fetchValidJsonData(url);
    
    text = data['data']['content_md'];
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
    // grabs the list of participating subs from the r/ModCoord wiki
    await appendList("/r/ModCoord/wiki/index.json")
    
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

// a flag to be used when it's time to refresh the list of participafinf
// subreddits
var refreshSubredditList = false;

var countTimeout = null;

io.on('connection', (socket) => {
    if (firstCheck == false) {
        socket.emit("loading");
    } else if (refreshSubredditList) {
        socket.emit("refreshing");
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

function updateStatus() {
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
        
        // this statement will trigger if this is the first call to updateStatus
        // since the subreddit list refreshed
        if (refreshSubredditList) {
            io.emit("subreddits-refreshed", subreddits);
            console.log("Emitted the refreshed list of subreddits");
            
            // reset the flag
            refreshSubredditList = false;
        }
        
        // the updating is now complete, resolve the promise
        resolve();
    }
}

// this function calls updateStatus to check/update the status of
// the subreddits, then uses setTimeout to wait for the amount of
// time specified in the config before the function is called again.
async function continuouslyUpdate() {
    // do we need to refresh the list of participating subs?
    if (refreshSubredditList) {
        console.log("About to refresh the subreddit list");
        
        // clear the subreddit list variables
        subreddits_src = {};
        subreddits = {};
        
        // create the new list
        await createList();
        
        // the list has now been updated
        // the flag will be reset in the next call to updateStatus
        console.log("Subreddit list refreshed, proceeding to updateStatus");
    }
    
    await updateStatus();
    setTimeout(continuouslyUpdate, config.updateInterval); // interval between updates set in the config file
}

// builds the list of subreddits, then starts the continuous
// updating of the subreddit statuses
async function run() {
    await createList();
    continuouslyUpdate();
    
    // every 3 hours, set a flag to refresh the list of participating
    // subreddits (which is then picked up in continuouslyUpdate)
    setInterval(() => {
        console.log("refreshSubredditList flag set to true");
        refreshSubredditList = true;
    }, 10800000);
}


run();
