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
        newStatusUpdate("Enabled audio alerts.");
    } else {
        audioSystem.playAudio = false;
        newStatusUpdate("Disabled audio alerts.");
        document.getElementById("enable_sounds").innerHTML = "Enable sound alerts"
    }
})
var socket = io();

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
    newStatusUpdate("List of subreddits updated");
});

socket.on("update", (data) => {
    updateSubreddit(data);
})

socket.on("loading", () => {
    loaded = false;
    document.getElementById("list").innerHTML = "Server reloading...";
})

// if the subreddit list is being refreshed
socket.on("refreshing", () => {
    loaded = false;
    document.getElementById("list").innerHTML = "Updating list of subreddits..."; 
});

socket.on('disconnect', function () {
    loaded = false;
});
socket.on("updatenew", (data) => {
    if (data.status == "private" || data.status == "restricted") {
        console.log("NEW PRIVATE (o7): " + data.name);
        dark++;
    } else {
        console.log(":/ new public: " + data.name);
        dark--;
    }
    updateSubreddit(data, true);
})
function doScroll(el) {
    const elementRect = el.getBoundingClientRect();
    const absoluteElementTop = elementRect.top + window.pageYOffset;
    const middle = absoluteElementTop - (window.innerHeight / 2);
    window.scrollTo(0, middle);
}

// not alerting for these subs as they've been spamming
// back and forth between private and public
const subsToFilter = [
    "r/bi_irl",
    "r/suddenlybi",
    "r/ennnnnnnnnnnnbbbbbby"
];

function updateSubreddit(data, _new = false) {
    if (!loaded) return;
    
    var subredditElement = document.getElementById(data.name);
    if (subredditElement == null) {
        // if this happens, the subreddit list has probably been refreshed
        // but not yet emmitted
        console.log("Skipped over " + data.name + " going " + data.status + ": not in list");
        return;
    }
    
    if (data.status == "private") {
        if (_new && !subsToFilter.includes(data.name.toLowerCase())) {
            newStatusUpdate("<strong>" + data.name + "</strong> has gone private!", function () {
                doScroll(subredditElement);
            })
            audioSystem.playPrivate();
        }
        subredditElement.classList.add("subreddit-private");

    }else if (data.status == "restricted") {
        if (_new && !subsToFilter.includes(data.name.toLowerCase())) {
            newStatusUpdate("<strong>" + data.name + "</strong> has gone restricted!", function () {
                doScroll(document.getElementById(data.name));
            })
            audioSystem.play("privated")
        }
        document.getElementById(data.name).classList.add("subreddit-restricted");
    } else {
        if (_new && !subsToFilter.includes(data.name.toLowerCase())) {
            newStatusUpdate("<strong>" + data.name + "</strong> has gone public.", function () {
                doScroll(subredditElement);
            })
            audioSystem.playPublic();
        }
        subredditElement.classList.remove("subreddit-private");
    }
    updateStatusText();
    document.getElementById(data.name).querySelector("p").innerHTML = data.status;
}

function genItem(name, status) {
    var _item = document.createElement("div");
    var _status = document.createElement("p");
    var _title = document.createElement("a");
    _item.className = "subreddit";
    _title.innerHTML = name;
    _status.innerHTML = status;
    _title.href = "https://old.reddit.com/" + name;
    _item.id = name;
    if (status != "public") {
        _item.classList.add("subreddit-private");
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
function newStatusUpdate(text, callback = null) {
    var item = Object.assign(document.createElement("div"), { "className": "status-update" });
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
