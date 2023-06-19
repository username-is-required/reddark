var audioSystem = {
    playAudio: false,
    
    audio: {
        madePrivate: new Audio('/audio/privated.mp3'),
        madePublic: new Audio('/audio/public.mp3')
    },
    
    isPlaying: function(audioObj) {
        return audioObj.currentTime > 0
            && !audioObj.paused
            && !audioObj.ended;
    },
    
    play: function(audioObj) {
        if (!this.playAudio) return;
        
        if (this.isPlaying(audioObj)) audioObj.currentTime = 0;
        else audioObj.play();
    },
    
    playPrivate: function() {
        this.play(this.audio.madePrivate);
    },
    
    playPublic: function() {
        this.play(this.audio.madePublic);
    }
}
document.getElementById("enable_sounds").addEventListener("click", function () {
    if (audioSystem.playAudio == false) {
        document.getElementById("enable_sounds").innerHTML = "Disable sound alerts"
        audioSystem.playAudio = true;
        audioSystem.playPrivate();
        newStatusUpdate("Enabled audio alerts.", null);
    } else {
        audioSystem.playAudio = false;
        newStatusUpdate("Disabled audio alerts.", null);
        document.getElementById("enable_sounds").innerHTML = "Enable sound alerts"
    }
})
var socket = io();

// emit client info to socket once connected
// (this isn't currently listened for, but keeping it here
// in case we want to get the server to listen for it again
// in the future)
socket.on("connect", () => {
    socket.emit("client-info", {
        reloadable: true
    });
});

var amount = 0;
var dark = 0;

var loaded = false;
socket.on("subreddits", (data) => {
    loaded = false;
    document.getElementById("list").innerHTML = "Loading...";
    fillSubredditsList(data);
})

socket.on("subreddits-refreshed", (data) => {
    loaded = false;
    document.getElementById("list").innerHTML = "Loading...";
    fillSubredditsList(data);
    newStatusUpdate("List of subreddits updated", null);
});

socket.on("update", (data) => {
    updateSubreddit(data);
});

// this might come in handy
// (it *would* be handy to use after implementing restricted subs,
// if i'd had the foresight to include it earlier);
socket.on("reload", () => {
    // reload the page in between 0-20s
    // (staggered to hopefully not kill my server by way of an accidentsl ddos)
    setTimeout(() => {
        location.reload();
    }, Math.floor(Math.random() * 20000));
});

socket.on("loading", () => {
    loaded = false;
    document.getElementById("list").innerHTML = "Server reloading...";
});

// if the subreddit list is being refreshed
socket.on("refreshing", () => {
    loaded = false;
    document.getElementById("list").innerHTML = "Updating list of subreddits..."; 
});

socket.on('disconnect', function () {
    loaded = false;
});
socket.on("updatenew", (data) => {
    var logstring = "";
    if (data.subData.status == "private" || data.subData.status == "restricted") {
        logstring += "NEW PRIVATE (o7): " + data.subData.name;
    } else {
        logstring += ":/ new public: " + data.subData.name;
    }
    if (!data.displayAlert) logstring += " (alert filtered)";
    console.log(logstring);
    
    updateSubreddit(data, true);
})
function doScroll(el) {
    const elementRect = el.getBoundingClientRect();
    const absoluteElementTop = elementRect.top + window.pageYOffset;
    const middle = absoluteElementTop - (window.innerHeight / 2);
    window.scrollTo(0, middle);
}

function updateSubreddit(data, _new = false) {
    if (!loaded) return;

    const subData = data.subData;
    const subName = subData.name;
    let subStatus = subData.status; // public, private, restricted, john-oliver
    
    var subredditElement = document.getElementById(subName);
    if (subredditElement == null) {
        // if this happens, the subreddit list has probably been refreshed
        // but not yet emmitted
        console.log("Skipped over " + subName + " going " + subStatus + ": not in list");
        return;
    }

    if (subredditElement.classList.contains("subreddit-private")) {
        prevStatus = "private";
    } else if (subredditElement.classList.contains("subreddit-restricted")) {
        prevStatus = "restricted";
    } else if (subredditElement.classList.contains("subreddit-john-oliver")) {
        prevStatus = "john-oliver";
    } else {
        prevStatus = "public";
    }

    const displayAlert = data.displayAlert;
    
    subredditElement.classList.add("subreddit-" + subStatus);
    subredditElement.classList.remove("subreddit-" + prevStatus);
    
    if (prevStatus == "john-oliver") prevStatus = "John Oliver";
    
    if (subStatus == "private") {
        if (_new && displayAlert) {
            var statusUpdateText = "<strong>" + subName + "</strong><br>" + prevStatus.replaceAll("-", " ") + " → <strong>private</strong>";
            if (prevStatus != "restricted") statusUpdateText += "!";
            newStatusUpdate(statusUpdateText, "private", () => doScroll(subredditElement));
            
            audioSystem.playPrivate();
        }
        
        if (prevStatus != "restricted") dark++;
    } else if (subStatus == "restricted") {
        if (_new && displayAlert) {
            var statusUpdateText = "<strong>" + subName + "</strong><br>" + prevStatus.replaceAll("-", " ") + " → <strong>restricted</strong>";
            if (prevStatus != "private") statusUpdateText += "!";
            newStatusUpdate(statusUpdateText, "restricted", () => doScroll(subredditElement));
            
            audioSystem.playPrivate();
        }
        
        if (prevStatus != "private") dark++;
    } else if (subStatus == "john-oliver") {
        if (_new && displayAlert) {
            var statusUpdateText = "<strong>" + subName + "</strong><br>" + prevStatus + " → <strong>John Oliver</strong>!";
            newStatusUpdate(statusUpdateText, "john-oliver", () => doScroll(subredditElement));

            audioSystem.playPrivate();
        }

        if (prevStatus != "public") dark--;
    } else {
        if (_new && displayAlert) {
            var statusUpdateText = "<strong>" + subName + "</strong><br>" + prevStatus.replaceAll("-", " ") + " → <strong>public</strong> :(";
            newStatusUpdate(statusUpdateText, "public", () => doScroll(subredditElement));
            
            audioSystem.playPublic();
        }
        
        if (prevStatus != "John Oliver") dark--;
    }
    
    updateStatusText();
    subredditElement.querySelector("p").innerHTML = subStatus.replaceAll("-", " ");
}

function genItem(name, status) {
    var _item = document.createElement("div");
    var _status = document.createElement("p");
    var _title = document.createElement("a");
    _item.className = "subreddit";
    _title.innerHTML = name;
    if (status == "john-oliver") _status.innerHTML = "John Oliver";
    else _status.innerHTML = status.replaceAll("-", " ");
    _title.href = "https://old.reddit.com/" + name;
    _title.target = "_blank";
    _item.id = name;
    if (status != "public") {
        _item.classList.add("subreddit-" + status);
    }
    _item.appendChild(_title);
    _item.appendChild(_status);
    return _item;
}

function hidePublicSubreddits() {
    document.getElementById("list").classList.toggle("hide-public");
    document.getElementById("hide-public").classList.toggle("toggle-enabled");
}

function fillSubredditsList(data) {
    dark = 0;
    amount = 0;
    document.getElementById("list").innerHTML = "";

    for (var section in data) {
        if (section != "") document.getElementById("list").innerHTML += "<h1>" + section + "</h1>";
        var sectionGrid = Object.assign(document.createElement("div"), { "classList": "section-grid" })
        for (var subreddit of data[section]) {
            amount++;
            if (subreddit.status == "private" || subreddit.status == "restricted") {
                dark++;
            }
            sectionGrid.appendChild(genItem(subreddit.name, subreddit.status));
        }
        document.getElementById("list").appendChild(sectionGrid);
    }
    loaded = true;
    updateStatusText();
}

function updateStatusText() {
    document.getElementById("amount").innerHTML = "<strong>" + dark + "</strong><light>/" + amount + "</light> subreddits are currently dark.";
}
function newStatusUpdate(text, status, callback = null) {
    var item = Object.assign(document.createElement("div"), { "className": "status-update" });
    item.classList.add("status-update-" + status);
    item.innerHTML = text;
    document.getElementById("statusupdates").appendChild(item);
    setTimeout(() => {
        item.remove();
    }, 10000);
    if (callback != null) {
        item.addEventListener("click", function () {
            callback();
        })
    }
}
