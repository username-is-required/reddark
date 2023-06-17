module.exports = {
    // the port to listen on
    port: process.env.PORT, 
    
    // delay/interval in between sending each http request in
    // updateStatus (in ms)
    intervalBetweenRequests: process.env.INTERVAL_BETWEEN_REQUESTS,
    
    // interval in between the end of one updateStatus call and
    // the start of another (in ms)
    updateInterval: process.env.UPDATE_INTERVAL,
    
    // interval between refreshes of the list of participating
    // subs (in ms)
    listRefreshInterval: process.env.LIST_REFRESH_INTERVAL,
    
    // the url where the site will be accessible (used for CORS)
    url: process.env.URL,
    
    // whether or not to emit a signal to reload clients
    // after a new deployment
    reloadClientsFollowingDeployment: (process.env.RELOAD_CLIENTS_FOLLOWING_DEPLOYMENT === "true"),
    
    // the number of status changes a sub can make in a given hour before having
    // the rest of its status changes for the rest of the hour auto-filtered from
    // being alerted to the client
    allowedHourlyStatusChanges: process.env.ALLOWED_HOURLY_STATUS_CHANGES,
    
    // whether to comment in a github issue following a reddit api request hanging
    // (if this is set to true, the three other github env variables also need to be specified
    commentInGithubIssueAfterRequestHangs: (process.env.COMMENT_IN_GITHUB_ISSUE_AFTER_REQUEST_HANGS === "true"),
    
    // the github repository of the issue to leave a comment on
    githubRepo: process.env.GITHUB_REPO,
    
    // the issue number of the issue to leave a comment on
    githubIssue: process.env.GITHUB_ISSUE,
    
    // the github access token to be used to leave a comment on the specified issue
    githubAccessToken: process.env.GITHUB_ACCESS_TOKEN
}
