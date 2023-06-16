// a list of filtered subs. all alerts from these subs will be filtered - none will be shown to clients.
// this is because these subs have been previously known to spam changes to their subreddit's status.

var filteredSubs = [
    // "r/bi_irl",
    // "r/suddenlybi",
    // "r/ennnnnnnnnnnnbbbbbby",
    // "r/seriouslyfuckspez",
    // "r/feemagers",
    // "r/brexitatemyface",
    // "r/emoney",
    // "r/inzaghi",
    "r/gtafk",
];

// set them all to lowercase (just in case)
for (let index in filteredSubs)
    filteredSubs[index] = filteredSubs[index].toLowerCase();


module.exports = filteredSubs;
