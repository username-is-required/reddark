const express = require('express');
const helmet = require('helmet');
const http = require('http');
const { Server } = require("socket.io");

var request = require("./requests.js");
var config = require("./config.js");
var filteredSubs = require("./filteredSubs.js");

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

// prove to google that i own the old domain name
app.get('/googlea3bd7d46d213f4a1.html', (req, res, next) => {
    if (req.header("host").match(/\breddark-digitalocean-7lhfr\.ondigitalocean\.app\b/i)) {
        res.sendFile(__dirname + '/googlea3bd7d46d213f4a1.html');
    } else {
        next();
    }
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
async function fetchValidJsonData(url) {
    var data = await request.httpsGet(url);
    
    try {
        data = JSON.parse(data);
        return data;
    } catch (err) {
        console.log("Request errored (bad JSON) [will retry] - " + url);
        
        // now we wait for 5 seconds and try it again!
        // 'resolving' the implied promise with...uhh, recursion
        await wait(5000);
        data = await fetchValidJsonData(url);
        return data;
    }
}

var subreddits_src = {

}
var subreddits = {};

var subredditCount = 0;

var johnOliverSubs = [];

var bannedSubs = [];

async function appendList(url) {
    var section = [];
    var sectionname = "";
    
    var data = await fetchValidJsonData(url);
    
    var text = data['data']['content_md'];
    //console.log(text);
    var lines = text.split("\n");
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
    
    // if there are any subs on the john oliver list that aren't on the modcoord list,
    // we'll add them in manually
    for (let johnOliverSub of johnOliverSubs) {
        let subInList = false;
        for (let section in subreddits_src) {
            for (let sub of subreddits_src[section]) {
                if (sub.toLowerCase() == johnOliverSub) {
                    subInList = true;
                    break;
                }
            }
            if (subInList) break;
        }

        if (subInList) continue;

        // here? the sub needs adding damnit.
        let subData = await fetchValidJsonData("/" + johnOliverSub + ".json");
        try {
            var subMembers = subData.data.children[0].data.subreddit_subscribers;
        } catch (e) {
            console.log(johnOliverSub + ": error getting subscribed count for johnoliver sub not in list");
            continue;
        }

        let listSection = "";
        
        // lets hope modcoord dont change the headings anytime soon
        if (subMembers > 40000000) listSection = "40+ million";
        else if (subMembers > 30000000) listSection = "30+ million";
        else if (subMembers > 20000000) listSection = "20+ million";
        else if (subMembers > 10000000) listSection = "10+ million";
        else if (subMembers > 5000000) listSection = "5+ million";
        else if (subMembers > 1000000) listSection = "1+ million";
        else if (subMembers > 500000) listSection = "500k+";
        else if (subMembers > 250000) listSection = "250k+";
        else if (subMembers > 100000) listSection = "100k+";
        else if (subMembers > 50000) listSection = "50k+";
        else if (subMembers > 5000) listSection = "5k+";
        else if (subMembers > 1000) listSection = "1k+";
        else listSection = "1k and below";

        subreddits_src[listSection].push(johnOliverSub);
        subreddits_src[listSection].sort((a,b) => a.localeCompare(b));
    }
}

async function createList(previousList = {}) {
    // grabs the list of participating subs from the r/ModCoord wiki
    await appendList("/r/ModCoord/wiki/index.json");
    
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
    
    // init the subStatusChangeCounts variable following the list creation
    initSubStatusChangeCounts();
    
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

// an object to keep track of how many status changes each sub has had
// in a given hour
// (this seems like a potentially memory intensive way to do autofiltering but i can't think of another)
// (if you're reading this and you *can* think of another way, please let me know! github.com/username-is-required/reddark/issues/new
var subStatusChangeCounts = {};

// a function to init that variable above
function initSubStatusChangeCounts(resetToZero = false) {
    // make a copy -- counts currently in there will be brought over
    // (providing the releavnt sub is still present in the new list, of course)
    subStatusChangeCountsCopy = Object.assign({}, subStatusChangeCounts);
    
    // following our copy, wipe the current list
    subStatusChangeCounts = {};

    // loop over the list of subs and add each one to the list.
    // if a sub had a count in the previous object, copy it over
    for (let section in subreddits) {
        for (let sub of subreddits[section]) {
            // if no prev count we'll start them at zero
            var prevCount = 0;
            
            if (!resetToZero) {
                prevCount = subStatusChangeCountsCopy[sub.name];

                if (prevCount === undefined) {
                    prevCount = 0;
                }
            }
            
            // add it in
            subStatusChangeCounts[sub.name] = prevCount;
        }
    }
}

// a helper function to 'load in' the statuses of a batch of subs
// will call itself repeatedly until it has a **full valid response** for every sub
// (this may or may not come back to haunt me)
async function loadSubredditBatchStatus(subNameBatch, sectionIndex) {
    const batchLoggingPrefix = "BATCH[start:" + subNameBatch[0] + "](" + subNameBatch.length + "): ";
    const subNameBatchPreserved = subNameBatch.slice();
    
    try {
        // send a request
        let batchData = await request.httpsGet("/api/info.json?sr_name=" + subNameBatch.join(","));
        
        // check valid json
        try {
            batchData = JSON.parse(batchData);
        } catch (e) {
            throw new Error("bad JSON");
        }
        
        if (typeof (batchData['message']) != "undefined" && batchData['error'] == 500) {
            throw new Error("500");
        }
        
        const subResponses = batchData["data"]["children"];
        
        // loop through the sub responses
        for (let subResponse of subResponses) {
            // simplify things a bit
            const data = subResponse["data"];
            
            // hello, what's your name, and is it one we were expecting
            const subIndexInBatch = subNameBatch.findIndex(el => {
                return el.toLowerCase() == data["display_name"].toLowerCase();
            });
            var subName = data["display_name_prefixed"];
            
            if (subIndexInBatch == -1) {
                // why the hell do we have a sub we didn't request
                throw new Error("unexpected sub [" + subName + "] in batch response");
            }
            
            // remove the sub name from the batch array
            // as a way of keeping track of which subs we've received data for
            subNameBatch.splice(subIndexInBatch, 1);
            
            // check it has a valid `subreddit_type` property
            let subStatus = subResponse["data"]["subreddit_type"];
            
            if (!["private", "restricted", "public", "archived"].includes(subStatus)) {
                throw new Error("status for [" + subName + "] not one of the expected values");
            }
            
            // assume 'archived' means 'mods purged'
            if (subStatus == "archived") {
                //console.log("ARCHIVED STATUS: " + subName);
                subStatus = "mods-purged";
            }
            // (ha its funny bc now i changed the client to just say 'archived') 
            
            // find this sub's index in the section array
            const subIndex = subreddits[sectionIndex].findIndex(el => {
                return el["name"].toLowerCase() == subName.toLowerCase();
            });
            
            // update the subname to the one we have
            // (this helps to prevent problems caused by differencss in capitalisation)
            subName = subreddits[sectionIndex][subIndex]["name"];
            
            // check if it's banned
            // if not, & it's public, check if it's made the john oliver list
            if (bannedSubs.includes(subName.toLowerCase()) {
                subStatus = "banned";
            } else if (subStatus == "public" && johnOliverSubs.includes(subName.toLowerCase())) {
                subStatus = "john-oliver";
            }
            
            // get the sub's currently recorded status
            const knownSubStatus = subreddits[sectionIndex][subIndex]["status"];

            // have a list of 'dark statuses' -ie, statuses considered 'dark' for the purposes
            // of the counter
            const darkStatuses = ["private", "restricted", "mods-purged", "banned"];

            
            // if the sub's changed status, emit & log as such
            if (subStatus != knownSubStatus) {
                // if the sub isn't currently dark and is becoming dark, increment the counter
                // if the sub is currently dark and is leaving the darkness, decrement the counter
                if (darkStatuses.includes(subStatus) && !darkStatuses.includes(knownSubStatus)) {
                    privateCount++;
                } else if (!darkStatuses.includes(subStatus) && darkStatuses.includes(knownSubStatus)) {
                    privateCount--;
                }
                
                // update the status in our list
                subreddits[sectionIndex][subIndex]["status"] = subStatus;
                
                if (firstCheck) {
                    // figure out if we should display an alert
                    var displayAlert = subStatus == "mods-purged" || (
                        !filteredSubs.includes(subName.toLowerCase())
                        && subStatusChangeCounts[subName] < config.allowedHourlyStatusChanges
                    );
                    
                    io.emit("updatenew", {
                        "subData": subreddits[sectionIndex][subIndex],
                        "displayAlert": displayAlert
                    });
                    
                    var logText = subName + ": " + knownSubStatus + "→" + subStatus + " (" + privateCount + ")";
                    
                    if (!displayAlert) logText += " (alert filtered)"; // mention in logs if alert filtered
                    else if (subStatus != "mods-purged") subStatusChangeCounts[subName]++; // increment the count if the alert will be displayed
                    
                    console.log(logText);
                } else {
                    io.emit("update", {"subData": subreddits[sectionIndex][subIndex]});
                }
            } 
            
        }
        
        // if there are any subs left in the batch array, we didn't get data for them
        // and that's a problem
        if (subNameBatch.length > 0) {
            throw new Error("no data for " + subNameBatch.length + " subs: [" + subNameBatch.join(", ") + "]");
        }
        
        // if we get here, this batch should be sucessfully completed!
        return;
    } catch (err) {
        if (err.message == "timed out") {
            console.log(batchLoggingPrefix + "Request to Reddit timed out (will retry in 5s)");
        } else {
            console.log(batchLoggingPrefix + "Request to Reddit errored (will retry in 5s) - " + err);
        }
        
        // try again after 5s
        await wait(5000);
        let result = await loadSubredditBatchStatus(subNameBatchPreserved, sectionIndex);
        return result;
    }
}

var checkCounter = 0;

async function updateStatus() {
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
            wait(20000).then(() => {
                console.log("Emitting client reload signal");
                io.emit("reload");
            });
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
    
    // the updating is now complete, resolve the implied promise
    return
}

// this function calls updateStatus to check/update the status of
// the subreddits, then uses setTimeout to wait for the amount of
// time specified in the config before the function is called again.
async function continuouslyUpdate() {
    //fetch the current john oliver subs
    var johnOliverRawData = await fetchValidJsonData("https://raw.githubusercontent.com/username-is-required/reddark-subinfo/main/john-oliver-subs.json");
    johnOliverSubs = johnOliverRawData.johnOliverSubs;

    // fetch the current banned subs
    var bannedSubsRawData = await fetchValidJsonData("https://raw.githubusercontent.com/username-is-required/reddark-subinfo/main/banned-subs.json");
    bannedSubs = bannedSubsRawData.bannedSubs;
    
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

    // every hour, reset the subStatusChangeCounts
    setInterval(() => {
        console.log("Resetting alert autofilter counts"); // not the best wording i know
        initSubStatusChangeCounts(true);
    }, 3600000);
}


run();
