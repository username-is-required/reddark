const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

var request = require("./requests.js");
var config = require("./config.js")

// helper function to wait for some time before continuing
function wait(msDelay) {
    return new Promise((resolve) => {
        setTimeout(resolve, msDelay);
    });
}

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

var subreddits_src = {

}
var subreddits = {};

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
            sectionname = line.replace("##", "").trim();
        }
        if (line.startsWith("r/")) {
            section.push(line.trim());
        }
    }
    subreddits_src[sectionname] = section;
}

async function createList(previousList = {}) {
    // grabs the list of participating subs from the r/ModCoord wiki
    await appendList("/r/ModCoord/wiki/index.json")
    
    console.log("grabbed subreddits");
    //subreddits_src["30+ million:"].push("r/tanzatest")

    for (var section in subreddits_src) {
        console.log(section);
        subreddits[section] = [];
        for (var subreddit in subreddits_src[section]) {
            var subName = subreddits_src[section][subreddit];
            var subStatus = "public";
            
            var prevListSection = previousList[section];
            if (prevListSection != undefined) {
                var prevListSubreddit = prevListSection.find((element) => {
                    return element["name"] == subName;
                });
                
                if (prevListSubreddit != undefined) subStatus = prevListSubreddit["status"];
            }
            
            subreddits[section].push({
                "name": subName,
                "status": subStatus
            });
        }
    }
    console.log(subreddits);
    return;
}

firstCheck = false;

// a flag to be used when it's *time* to refresh the list of participating
// subreddits
var refreshSubredditList = false;

// a flag to be used when the subreddit list is *actually being updated*
var currentlyRefreshing = false;

var countTimeout = null;

io.on('connection', (socket) => {
    if (firstCheck == false) {
        socket.emit("loading");
    } else if (currentlyRefreshing) {
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
    return new Promise(async (resolve, reject) => {
        // the delay (in ms) between sending off requests to reddit
        // aka the anti-rate-limiter
        // (probably also the anti-server-crasher tbf)
        var delayBetweenRequests = config.intervalBetweenRequests;
        
        var httpsRequests = [];
        const stackTrace = new Error().stack
        checkCounter++;
        console.log("Starting check " + checkCounter + " with stackTrace: " + stackTrace);
        for (let section in subreddits) {
            for (let subreddit in subreddits[section]) {
                const httpsReq = request.httpsGet("/" + subreddits[section][subreddit].name + ".json").then((data) => {
                    try {
                        data = JSON.parse(data);
                    } catch (err) {
                        console.log(subreddits[section][subreddit].name + ": Request to Reddit errored (bad JSON), likely rate limited");
                        // error handling? the app will assume the sub is public
                        return;
                    }
                    
                    if (typeof (data['message']) != "undefined" && data['error'] == 500) {
                        console.log(subreddits[section][subreddit].name + ": Request to Reddit errored (500) - " + data);
                        // error handling? the app will assume the sub is public
                        return;
                    }
                    
                    //console.log("successful response for " + subreddits[section][subreddit].name);
                    
                    if (typeof (data['reason']) != "undefined" && data['reason'] == "private" && subreddits[section][subreddit].status != "private") {
                        // the subreddit is private and the app doesn't know about it yet
                        console.log("private: " + subreddits[section][subreddit].name);
                        
                        subreddits[section][subreddit].status = "private";
                        if (firstCheck == false) {
                            io.emit("update", subreddits[section][subreddit]);
                        } else {
                            io.emit("updatenew", subreddits[section][subreddit]);
                        }
                    } else if (subreddits[section][subreddit].status == "private" && typeof (data['reason']) == "undefined") {
                        // the subreddit is public but the app thinks it's private
                        console.log("public: " + subreddits[section][subreddit].name);
                        subreddits[section][subreddit].status = "public";
                        io.emit("updatenew", subreddits[section][subreddit]);
                    }
                }).catch((err) => {
                    if (err.message == "timed out") {
                        console.log(subreddits[section][subreddit].name + ": Request to Reddit timed out");
                    } else {
                        console.log(subreddits[section][subreddit].name + ": Request to Reddit errored - " + err);
                    }
                    
                    // error handling? the app will assume the sub is public
                });
                
                //console.log(subreddits[section][subreddit].name + ": request sent with delay: " + delayBetweenRequests);
                httpsRequests.push(httpsReq);
                
                // wait between requests
                await wait(delayBetweenRequests);
                
                //delayBetweenRequests++;
            }
        }
        
        await Promise.all(httpsRequests);
        
        console.log("All requests for check " + checkCounter + " completed");
        console.log(config.updateInterval + "ms until next check");
        
        // all requests have now either been completed or errored
        if (!firstCheck) {
            io.emit("subreddits", subreddits);
            firstCheck = true;
        }
        
        // this statement will trigger if this is the first call to updateStatus
        // since the subreddit list refreshed
        if (currentlyRefreshing) {
            io.emit("subreddits-refreshed", subreddits);
            console.log("Emitted the refreshed list of subreddits");
            
            // reset the flag
            currentlyRefreshing = false;
        }
        
        // the updating is now complete, resolve the promise
        resolve();
    });
}

// this function calls updateStatus to check/update the status of
// the subreddits, then uses setTimeout to wait for the amount of
// time specified in the config before the function is called again.
async function continuouslyUpdate() {
    // do we need to refresh the list of participating subs?
    if (refreshSubredditList) {
        console.log("About to refresh the subreddit list");
        
        // reset the 'time to refresh' flag, and set the currentlyRefreshing flag
        refreshSubredditList = false;
        currentlyRefreshing = true;
        
        // create a temp copy of the pre-refresh subreddit list
        var oldSubreddits = subreddits;
        
        // clear the subreddit list variables
        subreddits_src = {};
        subreddits = {};
        
        // create the new list, passing in the old list
        // (subs also in the old list will have their status copied over)
        await createList(oldSubreddits);
        
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
    
    // after every config-specified interval, set a flag to refresh the list of participating
    // subreddits (which is then picked up in continuouslyUpdate)
    setInterval(() => {
        console.log("refreshSubredditList flag set to true");
        refreshSubredditList = true;
    }, config.listRefreshInterval);
}


run();
