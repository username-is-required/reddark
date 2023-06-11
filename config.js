module.exports = {
    // the port to listen on
    port: process.env.PORT, 
    
    // interval in between the end of one updateStatus call and
    // the start of another (in ms)
    updateInterval: process.env.UPDATE_INTERVAL,
    
    // interval between refreshes of the list of participating
    // subs (in ms)
    listRefreshInterval: process.env.LIST_REFRESH_INTERVAL,
    
    // the url where the site will be accessible (used for CORS)
    url: process.env.URL
}
