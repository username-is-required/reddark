const express = require('express');
const helmet = require('helmet');
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
app.use(helmet.strictTransportSecurity({
    "preload": true,
    "maxAge": 31536000
}));
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
    // redirect to the new url if we're here from the digitalocean instance's url
    if (req.header("host").match(/\breddark-digitalocean-7lhfr\.ondigitalocean\.app\b/i)) {
        return res.redirect(301, "https://reddark.io/");
    }
    
    res.sendFile(__dirname + '/index.html');
});
app.use(express.static('public'))

// a function to fetch data from a url and validate that it is JSON
// it is persistent and will keep trying until it gets valid JSON
function fetchValidJsonData(url) {
    return new Promise(async resolve => {
        var data = await request.httpsGet(url);
        
        try {
            data = JSON.parse(data);
            resolve(data);
        } catch (err) {
            console.log("Request to Reddit errored (bad JSON) [will retry] - " + data);
            
            // now we wait for 5 seconds and try it again!
            // 'resolving' the promise with...uhh, recursion
            setTimeout(async () => {
              data = await fetchValidJsonData(url);
              resolve(data);
            }, 5000);
        }
    });
}

var subreddits_src = {

}
var subreddits = {};

var subredditCount = 0;

async function appendList(url) {
    var section = [];
    var sectionname = "";
    
    data = await fetchValidJsonData(url);
    
    text = data['data']['content_md'];
    //console.log(text);
    lines = text.split("\n");
    for (var line of lines) {
        if (line.startsWith("##") && !line.includes("Please") && !line.includes("Combined") && !line.includes("Unique") && line.includes(":")) {
            if (section != []) subreddits_src[sectionname] = section;
            section = [];
            sectionname = line.replace("##", "").replace(":", "").trim();
        }
        if (line.startsWith("r/")) {
            var subName = line.trim();
            if (subName.slice(-1) == "/") subName = subName.slice(0, -1);
            // exclude a single nonexistent sub that seems to be on the list for some reason
            if (subName != "r/speziscool") section.push(subName);
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
            
            subredditCount++;
            
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

// a count of the number of subs currenrly private
// for use in logs (for fun)
var privateCount = 0;

var countTimeout = null;
var connectionsInLast5s = 0;

//var reloadableClients = [];

io.on('connection', (socket) => {
    if (firstCheck == false) {
        socket.emit("loading");
    } else if (currentlyRefreshing) {
        socket.emit("refreshing");
    } else {
        socket.emit("subreddits", subreddits);
    }

    connectionsInLast5s++;
    clearTimeout(countTimeout);
    countTimeout = setTimeout(() => {
        console.log('currently connected users: ' + io.engine.clientsCount /*+ " (" + reloadableClients.length + " reloadable)"*/);
    }, 750);
});

setInterval(() => {
    if (connectionsInLast5s > 0) {
        console.log("connections in last 5s: " + connectionsInLast5s);
        connectionsInLast5s = 0;
    }
}, 5000);

server.listen(config.port, () => {
    console.log('listening on *:' + config.port);
});

// a helper function to 'load in' the statuses of a batch of subs
// will call itself repeatedly until it has a **full valid response** for every sub
// (this may or may not come back to haunt me)
function loadSubredditBatchStatus(subNameBatch, sectionIndex) {
    const batchLoggingPrefix = "BATCH[start:" + subNameBatch[0] + "](" + subNameBatch.length + "): ";
    const subNameBatchPreserved = subNameBatch.slice();
    
    return new Promise( resolve => { // not even giving it the parameter to reject lol
        // send a request
        const httpsReq = request.httpsGet("/api/info.json?sr_name=" + subNameBatch.join(",")).then(data => {
            // check valid json
            try {
                data = JSON.parse(data);
            } catch (e) {
                //console.log(batchLoggingPrefix + "Request to Reddit errored (bad JSON) (will retry in 5s)");
                throw new Error("bad JSON");
            }
            
            if (typeof (data['message']) != "undefined" && data['error'] == 500) {
                //console.log(batchLoggingPrefix + "Request to Reddit errored (500) (will retry in 5s) - " + data);
                throw new Error("500 :: " + data);
            }

            const subResponses = data["data"]["children"];
            
            // loop through the sub responses
            for (let subResponse of subResponses) {
                // simplify things a bit
                const data = subResponse["data"];
                
                // hello, what's your name, and is it one we were expecting
                const subIndexInBatch = subNameBatch.findIndex(el => {
                    return el.toLowerCase() == data["display_name"].toLowerCase();
                });
                const subName = data["display_name_prefixed"];

                if (subIndexInBatch == -1) {
                    // why the hell do we have a sub we didn't request
                    throw new Error("unexpected sub [" + subName + "] in batch response");
                }

                // remove the sub name from the batch array
                // as a way of keeping track of which subs we've received data for
                subNameBatch.splice(subIndexInBatch, 1);
                
                // check it has a valid `subreddit_type` property
                const subStatus = subResponse["data"]["subreddit_type"];

                if (!["private", "restricted", "public"].includes(subStatus)) {
                    throw new Error("status for [" + subName + "] not one of the expected values");
                }
                
                // find this sub's index in the section array
                const subIndex = subreddits[sectionIndex].findIndex(el => {
                    return el["name"].toLowerCase() == subName.toLowerCase();
                });

                // get the sub's currently recorded status
                const knownSubStatus = subreddits[sectionIndex][subIndex]["status"];
                var statusChanged = false;

                // sub status logic
                switch (subStatus) {
                    case "private":
                        switch (knownSubStatus) {
                            case "public":
                                // sub now private, app thinks it's something elss
                                privateCount++; // deliberately no break after this line
                            case "restricted":
                                // flag a status change
                                statusChanged = true;
                                break;
                        }
                        break;
                    case "restricted":
                        switch (knownSubStatus) {
                            case "public":
                                // sub now restricted, app thinks it's something elss
                                privateCount++; // deliberately no break after this line
                            case "private":
                                // flag a status change
                                statusChanged = true;
                                break;
                        }
                        break;
                    case "public":
                        if (["private", "restricted"].includes(knownSubStatus)) {
                            privateCount--;
                            // flag a status change
                            statusChanged = true;
                        }
                        break;
                }

                // if the sub's changed status, emit & log as such
                if (statusChanged) {
                    // update the status in our list
                    subreddits[sectionIndex][subIndex]["status"] = subStatus;
                 
                    if (firstCheck) {
                        io.emit("updatenew", subreddits[sectionIndex][subIndex]);
                        console.log(knownSubStatus + "→" + subStatus + ": " + subName + " (" + privateCount + ")");
                    } else {
                        io.emit("update", subreddits[sectionIndex][subIndex]);
                    }
                }
            }
            
            // if there are any subs left in the batch array, we didn't get data for them
            // and that's a problem
            if (subNameBatch.length > 0) {
                throw new Error("no data for " + subNameBatch.length + " subs: [" + subNameBatch.join(", ") + "]");
            }

            // if we get here, this batch should be sucessfully completed!
            resolve();
        }).catch(err => {
            if (err.message == "timed out") {
                console.log(batchLoggingPrefix + "Request to Reddit timed out (will retry in 5s)");
            } else {
                console.log(batchLoggingPrefix + "Request to Reddit errored (will retry in 5s) - " + err);
            }
            
            // try again after 5s
            setTimeout(async () => {
                const result = await loadSubredditBatchStatus(subNameBatchPreserved, sectionIndex);
                resolve(result);
            }, 5000);
        });
    });
}

var checkCounter = 0;

function updateStatus() {
    return new Promise(async (resolve, reject) => {
        // the delay (in ms) between sending off requests to reddit
        // aka the anti-rate-limiter
        // (probably also the anti-server-crasher tbf)
        var delayBetweenRequests = config.intervalBetweenRequests;
        
        var batchLoadRequests = [];
        checkCounter++;
        console.log("** Starting check " + checkCounter + " **");
        for (let section in subreddits) {
            // batch subreddits together so we can  request data on them in a single api call
            var subredditBatch = [];
            
            for (let subIndex in subreddits[section]) {
                subredditBatch.push(subreddits[section][subIndex].name.substring(2));
                
                // if the batch is full, or the section is complete
                if (subredditBatch.length == 100 || subIndex == subreddits[section].length - 1) {
                    // gets the batch loading
                    const batchLoadPromise = loadSubredditBatchStatus(subredditBatch, section);

                    // empty the current batch
                    subredditBatch = [];

                    batchLoadRequests.push(batchLoadPromise);
                
                    // wait between requests
                    await wait(delayBetweenRequests);
                }
            }
        }

        // wait for them all to complete
        await Promise.all(batchLoadRequests);
        
        console.log("All batched requests for check " + checkCounter + " complete");
        console.log(config.updateInterval + "ms until next check");
        
        // all requests have now either been completed or errored
        if (!firstCheck) {
            // emit the reload signal if the config instructs
            // to reload clients following deployment
            if (config.reloadClientsFollowingDeployment) {
                console.log("Client reload flag set, emitting reload signal in 20s");
                setTimeout(() => {
                    console.log("Emitting client reload signal");
                    io.emit("reload");
                }, 20000);
            }
            
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
        subredditCount = 0;
        
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
